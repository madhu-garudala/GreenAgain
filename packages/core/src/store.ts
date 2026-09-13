import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { hash, type Incident, type Evidence, type Event } from './contracts.js';

export class Store {
  readonly client=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
  constructor(readonly table=process.env.TABLE_NAME!){if(!table)throw new Error('TABLE_NAME is required');}
  async get<T>(pk:string,sk='META'):Promise<T|undefined>{return (await this.client.send(new GetCommand({TableName:this.table,Key:{pk,sk},ConsistentRead:true}))).Item?.data as T|undefined;}
  async put(pk:string,data:unknown,sk='META'){await this.client.send(new PutCommand({TableName:this.table,Item:{pk,sk,data}}));}
  async list():Promise<Incident[]>{const r=await this.client.send(new QueryCommand({TableName:this.table,IndexName:'list',KeyConditionExpression:'gpk = :g',ExpressionAttributeValues:{':g':'INCIDENT'},ScanIndexForward:false,Limit:50}));return (r.Items||[]).map(x=>x.data as Incident);}
  async events(id:string):Promise<Event[]>{const r=await this.client.send(new QueryCommand({TableName:this.table,KeyConditionExpression:'pk = :p AND begins_with(sk, :s)',ExpressionAttributeValues:{':p':`INCIDENT#${id}`,':s':'EVENT#'},Limit:200}));return (r.Items||[]).map(x=>x.data as Event);}
  async ingest(evidence:Evidence):Promise<string>{
    const fingerprint=hash({releaseId:evidence.releaseId,version:evidence.version,deploymentRevision:evidence.deploymentRevision,app:'support-agent',environment:'production'}),id=fingerprint.slice(0,24),now=new Date().toISOString();
    const incident:Incident={id,fingerprint,app:'support-agent',environment:'production',releaseId:evidence.releaseId,state:'DETECTED',revision:0,createdAt:now,updatedAt:now,summary:evidence.summary,evidence:[evidence]};
    try{await this.client.send(new TransactWriteCommand({TransactItems:[
      {Put:{TableName:this.table,Item:{pk:`SOURCE#${evidence.traceId}`,sk:'META',ttl:Math.floor(Date.now()/1000)+604800},ConditionExpression:'attribute_not_exists(pk)'}},
      {Put:{TableName:this.table,Item:{pk:`INCIDENT#${id}`,sk:'META',gpk:'INCIDENT',gsk:now,data:incident},ConditionExpression:'attribute_not_exists(pk)'}},
      {Put:{TableName:this.table,Item:{pk:`OUTBOX#${id}`,sk:'META',kind:'outbox',sent:false,data:{id,kind:'incident',incidentId:id,createdAt:now}}}},
      {Put:{TableName:this.table,Item:{pk:`INCIDENT#${id}`,sk:`EVENT#${now}#detected`,data:{id:randomUUID(),type:'evidence_added',message:evidence.summary,createdAt:now,actor:'poller'}}}},
    ]}));}catch(e){if((e as Error).name!=='TransactionCanceledException')throw e;const existing=await this.get<Incident>(`INCIDENT#${id}`);if(!existing)throw e;}
    return id;
  }
  async save(previous:Incident,next:Incident,type:string,message:string,actor='worker'){
    const event:Event={id:randomUUID(),type,message,actor,createdAt:new Date().toISOString()};
    await this.client.send(new TransactWriteCommand({TransactItems:[
      {Put:{TableName:this.table,Item:{pk:`INCIDENT#${next.id}`,sk:'META',gpk:'INCIDENT',gsk:next.createdAt,data:next},ConditionExpression:'#d.revision = :r',ExpressionAttributeNames:{'#d':'data'},ExpressionAttributeValues:{':r':previous.revision}}},
      {Put:{TableName:this.table,Item:{pk:`INCIDENT#${next.id}`,sk:`EVENT#${event.createdAt}#${event.id}`,data:event}}},
    ]}));
  }
  async event(id:string,type:string,message:string,actor='worker'){const e={id:randomUUID(),type,message,actor,createdAt:new Date().toISOString()};await this.put(`INCIDENT#${id}`,e,`EVENT#${e.createdAt}#${e.id}`);}
  async lease(key:string,owner:string,seconds=120):Promise<boolean>{try{await this.client.send(new UpdateCommand({TableName:this.table,Key:{pk:`LEASE#${key}`,sk:'META'},UpdateExpression:'SET #o=:o, expires=:e',ConditionExpression:'attribute_not_exists(pk) OR expires < :now OR #o = :o',ExpressionAttributeNames:{'#o':'owner'},ExpressionAttributeValues:{':o':owner,':e':Date.now()+seconds*1000,':now':Date.now()}}));return true;}catch(e){if((e as Error).name==='ConditionalCheckFailedException')return false;throw e;}}
  async releaseLease(key:string,owner:string){await this.client.send(new DeleteCommand({TableName:this.table,Key:{pk:`LEASE#${key}`,sk:'META'},ConditionExpression:'#o = :o',ExpressionAttributeNames:{'#o':'owner'},ExpressionAttributeValues:{':o':owner}}));}
  async pending(){const rows=[];let cursor;do{const r: any=await this.client.send(new ScanCommand({TableName:this.table,FilterExpression:'kind = :k AND sent = :f',ExpressionAttributeValues:{':k':'outbox',':f':false},ExclusiveStartKey:cursor}));rows.push(...(r.Items||[]));cursor=r.LastEvaluatedKey;}while(cursor);return rows;}
  async sent(pk:string){await this.client.send(new UpdateCommand({TableName:this.table,Key:{pk,sk:'META'},UpdateExpression:'SET sent = :t',ExpressionAttributeValues:{':t':true}}));}
}
