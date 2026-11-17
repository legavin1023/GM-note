import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { driveIds, captureAssets } from '../backup/portable-assets.mjs';

test('portable export discovers unique original Drive IDs in dump rows',()=>{
  assert.deepEqual(driveIds('https://drive.google.com/thumbnail?id=abcdefghijk&sz=w1600 https://drive.google.com/file/d/abcdefghijk/view https://drive.google.com.evil.test/file/d/xxxxxxxxxxx/view https://example.org/a'),['abcdefghijk']);
});
test('original capture enforces budget, never forwards Storage credentials to Google, and verifies local hashes',async()=>{
  const staging=await mkdtemp(join(tmpdir(),'portable-test-')),previous=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}})};
  const config={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
  const inventory={buckets:[],objects:[{id:'12345678-1234-1234-1234-123456789abc',bucket_id:'images',name:'sub/a.png',metadata:{size:3}}]};
  try{
    const result=await captureAssets({staging,config,inventory,ids:['abcdefghijk'],maxBytes:6});
    assert.equal(result.verified,true);assert.equal(result.bytes,6);assert.equal(result.files.length,2);
    assert.equal(calls[0].options.headers.apikey,'test-only');assert.equal(calls[1].options.headers,undefined);
    assert.equal((await readFile(join(staging,result.files[0].file))).length,3);
  }finally{globalThis.fetch=previous;await rm(staging,{recursive:true,force:true});}
});
test('portable Drive capture rejects HTML instead of archiving an error page as an image',async()=>{
  const staging=await mkdtemp(join(tmpdir(),'portable-test-')),previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response('sign in',{headers:{'content-type':'text/html'}});
  try{await assert.rejects(captureAssets({staging,config:{},inventory:{objects:[]},ids:['abcdefghijk'],maxBytes:100}),/EXPORT_DRIVE_NOT_IMAGE/);}
  finally{globalThis.fetch=previous;await rm(staging,{recursive:true,force:true});}
});
test('portable capture refuses an external redirect and blocks downloads over its budget',async()=>{
  const staging=await mkdtemp(join(tmpdir(),'portable-test-')),previous=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://example.org/file'}})};
  try{
    await assert.rejects(captureAssets({staging,config:{},inventory:{objects:[]},ids:['abcdefghijk'],maxBytes:100}),/EXPORT_DRIVE_REDIRECT/);
    assert.equal(calls,1);
  }finally{globalThis.fetch=previous;await rm(staging,{recursive:true,force:true});}
  const separate=await mkdtemp(join(tmpdir(),'portable-test-'));
  try{await assert.rejects(captureAssets({staging:separate,config:{},inventory:{objects:[{metadata:{size:101}}]},ids:[],maxBytes:100}),/EXPORT_ASSET_BUDGET/);}
  finally{await rm(separate,{recursive:true,force:true});}
});
