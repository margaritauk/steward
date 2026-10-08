import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';
import { createApi } from './backend-app.mjs';

class SqliteAdapter {
  constructor(context) { this.context=context; }
  exec(sql) { this.context.storage.sql.exec(sql); }
  prepare(sql) {
    const query=(...params)=>this.context.storage.sql.exec(sql,...params.map(p=>Buffer.isBuffer(p)?p.buffer.slice(p.byteOffset,p.byteOffset+p.byteLength):p));
    return {get:(...params)=>query(...params).toArray()[0],all:(...params)=>query(...params).toArray(),run:(...params)=>{query(...params).toArray();return {changes:this.context.storage.sql.exec('SELECT changes() AS count').one().count};}};
  }
}

class ResponseBridge {
  constructor(){this.headers=new Headers({'Date':new Date().toUTCString(),'X-Content-Type-Options':'nosniff'});this.headersSent=false;this.handlers=[];this.status=200;this.promise=new Promise(resolve=>this.resolve=resolve);}
  setHeader(key,value){this.headers.set(key,value);}
  writeHead(status,headers={}){
    this.status=status;for(const [key,value]of Object.entries(headers))this.headers.set(key,value);this.headersSent=true;
    if(this.headers.get('Content-Type')?.includes('text/event-stream')){
      const stream=new ReadableStream({start:controller=>this.controller=controller,cancel:()=>{this.closed=true;for(const callback of this.handlers)callback();}});
      this.resolve(new Response(stream,{status,headers:this.headers}));
    }
  }
  write(text){if(this.closed)throw new Error('Stream closed');this.controller.enqueue(new TextEncoder().encode(text));}
  end(body=''){if(this.controller){if(!this.closed){this.closed=true;this.controller.close();for(const callback of this.handlers)callback();}}else this.resolve(new Response(body,{status:this.status,headers:this.headers}));}
  on(name,callback){if(name==='close')this.handlers.push(callback);}
}

export class BanquetVenue extends DurableObject {
  constructor(context,env){super(context,env);this.db=new SqliteAdapter(context);this.api=createApi(this.db,context,env);}
  async fetch(request){
    const url=new URL(request.url);
    const req={method:request.method,headers:{...Object.fromEntries(request.headers),host:url.host},socket:{encrypted:url.protocol==='https:',remoteAddress:request.headers.get('CF-Connecting-IP')||'remote'},async *[Symbol.asyncIterator](){yield Buffer.from(await request.arrayBuffer());}};
    const res=new ResponseBridge();
    try {await this.api(req,res,url);}catch(error){if(!res.headersSent){res.writeHead(error.status||500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.status?error.message:'Something went wrong. Please try again.'}));}else res.end();if(!error.status)console.error(error);}
    return res.promise;
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/'))return env.BANQUET.get(env.BANQUET.idFromName('venue')).fetch(request);
    const response=await env.ASSETS.fetch(request);
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','same-origin');
    headers.set('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    return new Response(response.body,{status:response.status,headers});
  }
};
