import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testMatch:'operator.spec.ts',workers:1,fullyParallel:false,use:{...base.use,baseURL:'https://localhost:5443',ignoreHTTPSErrors:true},webServer:{command:'NODE_ENV=test node --import tsx tests/fixtures/hosted-server.ts',url:'https://localhost:5443/api/status',ignoreHTTPSErrors:true,reuseExistingServer:false,timeout:30000},outputDir:'/tmp/ax-operator-e2e'});
