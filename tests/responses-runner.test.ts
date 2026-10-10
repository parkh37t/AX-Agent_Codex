import { describe,it,expect,vi } from 'vitest';
import { createResponsesRunner, type ResponsesConfig } from '../server/responses-runner';
import { workflowProject,workflowResult } from './fixtures/workflow';
const config:ResponsesConfig={enabled:true,model:'synthetic-model',maxRequestBytes:200000,maxOutputTokens:512,maxResponseBytes:2000000,timeoutMs:1000,retries:0,inputUsdPerMillion:0.2,outputUsdPerMillion:1.2};
const input=()=>({project:workflowProject(),task:'rfp' as const});
function output(extra:Record<string,unknown>={}){return {id:'resp_synthetic',status:'completed',usage:{input_tokens:100,output_tokens:200,total_tokens:300},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(workflowResult(input().project,'rfp'))}]}],...extra};}
function opts(signal=new AbortController().signal){return {signal,scope:{subject:'synthetic',accountId:'ax',workspaceId:'test',sessionId:'one',expiresAt:Date.now()+60000},reserveBudget:vi.fn(()=> 'reservation'),onUsage:vi.fn(),onKnowledge:vi.fn()};}
const transport=(response:Response)=>vi.fn(async()=>response) as unknown as typeof fetch;
describe('operator Responses API adapter (transport doubles only, no network)',()=>{
 it('fails closed for missing key, disabled execution, missing rates and missing budget guard',async()=>{
  const f=transport(Response.json(output()));
  for(const [c,k] of [[config,undefined],[{...config,enabled:false},'synthetic'],[{...config,inputUsdPerMillion:undefined},'synthetic']] as const){const r=createResponsesRunner(c,()=>k,f);expect(r.status?.().ready).toBe(false);await expect(r.run(input(),opts())).rejects.toMatchObject({status:503});}
  await expect(createResponsesRunner(config,()=> 'synthetic',f).run(input(),{...opts(),reserveBudget:undefined})).rejects.toMatchObject({status:503});expect(f).not.toHaveBeenCalled();
 });
 it('uses the fixed official endpoint, structured output, Wylie references, no storage, and actual usage',async()=>{
  const f=transport(Response.json(output())),o=opts(),r=createResponsesRunner(config,()=> 'synthetic-unit-only',f);
  expect(await r.run(input(),o)).toEqual(workflowResult(input().project,'rfp'));
  const [url,request]=vi.mocked(f).mock.calls[0];expect(url).toBe('https://api.openai.com/v1/responses');const body=JSON.parse(request!.body as string);
  expect(body).toMatchObject({model:'synthetic-model',store:false,stream:false,max_output_tokens:512,text:{format:{type:'json_schema',strict:true}}});expect(body.input).toContain('Wylie');expect(body.input).not.toContain('synthetic-unit-only');expect(o.onKnowledge).toHaveBeenCalled();expect(o.reserveBudget).toHaveBeenCalledOnce();expect(o.onUsage).toHaveBeenCalledWith(expect.objectContaining({inputTokens:100,outputTokens:200,totalTokens:300}),'reservation');
 });
 it('rejects oversized input before reserving cost or making a request',async()=>{
  const f=transport(Response.json(output())),o=opts();await expect(createResponsesRunner({...config,maxRequestBytes:1024},()=> 'synthetic',f).run(input(),o)).rejects.toMatchObject({status:413});expect(f).not.toHaveBeenCalled();expect(o.reserveBudget).not.toHaveBeenCalled();
 });
 it('honors pre-cancellation without calling the provider',async()=>{
  const f=transport(Response.json(output())),a=new AbortController();a.abort();await expect(createResponsesRunner(config,()=> 'synthetic',f).run(input(),opts(a.signal))).rejects.toMatchObject({status:409});expect(f).not.toHaveBeenCalled();
 });
 it('times out and sanitizes transport errors without replaying ambiguous calls',async()=>{
  const f=vi.fn(async(_u,init)=>new Promise<Response>((_r,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new Error('synthetic-secret-should-not-leak')),{once:true});})) as typeof fetch;
  await expect(createResponsesRunner({...config,timeoutMs:20},()=> 'synthetic',f).run(input(),opts())).rejects.toMatchObject({status:504,message:'api_timeout'});expect(f).toHaveBeenCalledOnce();
 });
 it('does not retry network errors or 500 and never returns raw provider errors',async()=>{
  for(const f of [vi.fn(async()=>{throw new Error('raw-private-error');}) as typeof fetch,transport(new Response('raw-private-error',{status:500}))]){
   try{await createResponsesRunner({...config,retries:1},()=> 'synthetic',f).run(input(),opts());throw Error('unexpected success');}catch(e){expect(String(e)).not.toContain('raw-private-error');}expect(f).toHaveBeenCalledOnce();
  }
 });
 it('forwards mid-request cancellation and never retries it',async()=>{
  const a=new AbortController();let signal:AbortSignal|undefined;
  const f=vi.fn(async(_u,init)=>new Promise<Response>((_resolve,reject)=>{signal=init?.signal as AbortSignal;signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});})) as typeof fetch;
  const running=createResponsesRunner(config,()=> 'synthetic',f).run(input(),opts(a.signal));const rejected=expect(running).rejects.toMatchObject({status:409,message:'cancelled'});await vi.waitFor(()=>expect(f).toHaveBeenCalledOnce());a.abort();await rejected;expect(signal?.aborted).toBe(true);expect(f).toHaveBeenCalledOnce();
 });
 it('retries explicit 429 only when configured and reserves each attempt',async()=>{
  const f=vi.fn().mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(Response.json(output())) as typeof fetch,o=opts();await createResponsesRunner({...config,retries:1},()=> 'synthetic',f).run(input(),o);expect(f).toHaveBeenCalledTimes(2);expect(o.reserveBudget).toHaveBeenCalledTimes(2);expect(o.onUsage).toHaveBeenCalledOnce();
 });
 it('records returned usage on incomplete responses but never invents missing usage',async()=>{
  const a=opts();await expect(createResponsesRunner(config,()=> 'synthetic',transport(Response.json(output({status:'incomplete'})))).run(input(),a)).rejects.toMatchObject({message:'api_incomplete'});expect(a.onUsage).toHaveBeenCalledOnce();
  const b=opts();await createResponsesRunner(config,()=> 'synthetic',transport(Response.json(output({usage:undefined})))).run(input(),b);expect(b.onUsage).not.toHaveBeenCalled();
 });
 it('rejects refusal and invalid JSON output',async()=>{
  for(const content of [[{type:'refusal'}],[{type:'output_text',text:'not JSON'}]])await expect(createResponsesRunner(config,()=> 'synthetic',transport(Response.json(output({output:[{type:'message',content}]})))).run(input(),opts())).rejects.toMatchObject({status:expect.any(Number)});
 });
 it('enforces the response byte limit',async()=>{
  await expect(createResponsesRunner({...config,maxResponseBytes:1024},()=> 'synthetic',transport(new Response('x'.repeat(2000)))).run(input(),opts())).rejects.toMatchObject({message:'response_limit'});
 });
});
