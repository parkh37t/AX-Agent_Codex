import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { setTimeout as delay } from 'node:timers/promises';
import { artifactSchema } from '../shared/domain';
import { buildPrompt } from './prompt';
import { loadWylieKnowledge } from './knowledge';
import { WorkflowError, type WorkflowRunner } from './web-workflow';

const configSchema=z.object({enabled:z.boolean(),model:z.string().min(1).max(100),maxRequestBytes:z.number().int().min(1024).max(1500000),maxOutputTokens:z.number().int().min(128).max(16384),maxResponseBytes:z.number().int().min(1024).max(4000000),timeoutMs:z.number().int().min(10).max(300000),retries:z.number().int().min(0).max(1),inputUsdPerMillion:z.number().positive(),outputUsdPerMillion:z.number().positive()});
export type ResponsesConfig=z.infer<typeof configSchema>;
const wire=z.object({id:z.string().min(1).max(200),status:z.string(),usage:z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative(),total_tokens:z.number().int().nonnegative()}).optional(),output:z.array(z.object({type:z.string(),content:z.array(z.object({type:z.string(),text:z.string().optional()})).optional()})).default([])});
/** Official Responses REST transport. No SDK install, browser import, logging, or automatic connection on construction. */
export function createResponsesRunner(config:Partial<ResponsesConfig>,secret:()=>string|undefined,transport:typeof fetch=fetch):WorkflowRunner {
 const parsed=configSchema.safeParse(config);
 const status=()=>({ready:parsed.success&&parsed.data.enabled&&!!secret(),reason:!parsed.success?'configuration_required':!parsed.data.enabled?'operator_execution_disabled':!secret()?'operator_key_missing':'ready'});
 return {kind:'official',status,async run(input,options){
  if(!status().ready||!parsed.success)throw new WorkflowError(503,status().reason);
  if(!options.reserveBudget||!options.onUsage)throw new WorkflowError(503,'budget_guard_required');
  const c=parsed.data,timeout=AbortSignal.timeout(c.timeoutMs),signal=AbortSignal.any([options.signal,timeout]);
  const key=secret();if(!key)throw new WorkflowError(503,'operator_key_missing');
  const knowledge=await loadWylieKnowledge(input.task);await options.onKnowledge?.(knowledge.references);
  const schema=zodToJsonSchema(artifactSchema,{target:'openAi',$refStrategy:'none'});
  const body=JSON.stringify({model:c.model,store:false,stream:false,max_output_tokens:c.maxOutputTokens,input:buildPrompt({project:input.project,task:input.task,instruction:'',workflow:true},knowledge.text),text:{format:{type:'json_schema',name:'ax_artifacts',strict:true,schema}}});
  const bytes=Buffer.byteLength(body);if(bytes>c.maxRequestBytes)throw new WorkflowError(413,'request_limit');
  // Conservative byte-based token reservation, not an invoice. Operator must configure current model rates.
  const maximumUsd=(bytes*c.inputUsdPerMillion+c.maxOutputTokens*c.outputUsdPerMillion)/1e6;
  for(let attempt=0;attempt<=c.retries;attempt++){
   if(signal.aborted)throw new WorkflowError(timeout.aborted?504:409,timeout.aborted?'api_timeout':'cancelled');
   const reservation=await options.reserveBudget(maximumUsd);
   if(signal.aborted)throw new WorkflowError(timeout.aborted?504:409,timeout.aborted?'api_timeout':'cancelled');
   let response:Response;
   try {response=await transport('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body,signal});}
   catch {throw new WorkflowError(timeout.aborted?504:options.signal.aborted?409:502,timeout.aborted?'api_timeout':options.signal.aborted?'cancelled':'api_network_failure');}
   if(!response.ok){
    await response.body?.cancel();
    // Only explicit 429 can retry, at most once; ambiguous network/5xx failures never replay paid generation.
    if(response.status===429&&attempt<c.retries){try{await delay(100*(attempt+1),undefined,{signal});}catch{throw new WorkflowError(409,'cancelled');}continue;}
    throw new WorkflowError(response.status===429?429:502,`api_http_${response.status}`);
   }
   const reader=response.body?.getReader();if(!reader)throw new WorkflowError(502,'api_empty_response');
   const chunks:Uint8Array[]=[];let length=0;
   try {while(true){if(signal.aborted)throw new Error('aborted');const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>c.maxResponseBytes)throw new WorkflowError(502,'response_limit');chunks.push(part.value);}}
   catch(e){await reader.cancel().catch(()=>{});if(e instanceof WorkflowError)throw e;throw new WorkflowError(timeout.aborted?504:502,timeout.aborted?'api_timeout':'response_read_failed');}
   let data:z.infer<typeof wire>;
   try{data=wire.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{throw new WorkflowError(502,'api_invalid_response');}
   if(data.usage){const u=data.usage;await options.onUsage({responseId:data.id,model:c.model,inputTokens:u.input_tokens,outputTokens:u.output_tokens,totalTokens:u.total_tokens,estimatedUsd:(u.input_tokens*c.inputUsdPerMillion+u.output_tokens*c.outputUsdPerMillion)/1e6},reservation);}
   if(signal.aborted)throw new WorkflowError(timeout.aborted?504:409,timeout.aborted?'api_timeout':'cancelled');
   if(data.status!=='completed')throw new WorkflowError(502,'api_incomplete');
   const parts=data.output.flatMap(o=>o.type==='message'?o.content??[]:[]);
   if(parts.some(p=>p.type==='refusal'))throw new WorkflowError(422,'api_refusal');
   const text=parts.filter(p=>p.type==='output_text').map(p=>p.text??'').join('');
   try{return JSON.parse(text);}catch{throw new WorkflowError(502,'api_invalid_output');}
  }
  throw new WorkflowError(502,'api_failed');
 }};
}
/** Called only by a future server composition root; never expose the returned secret accessor to clients. */
export function operatorApiEnvironment(env:NodeJS.ProcessEnv){
 return {config:{enabled:env.AX_API_EXECUTION_ENABLED==='true',model:env.AX_API_MODEL??'',maxRequestBytes:200000,maxOutputTokens:4096,maxResponseBytes:2000000,timeoutMs:120000,retries:0,inputUsdPerMillion:Number(env.AX_INPUT_USD_PER_MILLION),outputUsdPerMillion:Number(env.AX_OUTPUT_USD_PER_MILLION)},secret:()=>env.OPENAI_API_KEY};
}
