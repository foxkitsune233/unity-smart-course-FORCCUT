// B1 freezes the contract. Persistent ingestion and reporting are a C-stage task.
export const verbs=Object.freeze(['opened','progressed','ended','changed','started','stopped','saved','checked','hinted','submitted','assessed','self_reported','confirmed','intervened','observed','voided','answered','noted','published','alerted']);
const clientVerbs=new Set(['opened','progressed','ended','changed','started','stopped','saved','checked','hinted','self_reported','answered','noted']);
const nonempty=v=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
export function normalizeClientEvent(input,{actorId}){
 if(!nonempty(actorId)||!input||!clientVerbs.has(input.verb))throw new Error('客户端不能产生此类事件');
 if(!/^[0-9a-f-]{36}$/i.test(input.eventId||'')||!nonempty(input.idempotencyKey)||!nonempty(input.objectType)||!nonempty(input.objectId)||!nonempty(input.courseVersionId)||!nonempty(input.offeringId)||!Number.isFinite(Date.parse(input.occurredAt)))throw new Error('事件字段不完整');
 const payload=input.payload??{};if(!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>4000)throw new Error('事件证据无效');
 if(input.verb==='hinted'&&(!nonempty(payload.hintId)||!['concept','location','solution'].includes(payload.hintLevel)||!['example','completion','independent'].includes(payload.scaffoldLevel)))throw new Error('提示事件缺少层级或任务支架');
 return {schemaVersion:1,eventId:input.eventId,idempotencyKey:input.idempotencyKey,actorId,verb:input.verb,objectType:input.objectType,objectId:input.objectId,courseVersionId:input.courseVersionId,offeringId:input.offeringId,occurredAt:new Date(input.occurredAt).toISOString(),source:input.verb==='self_reported'?'self_reported':'client_observed',payload:structuredClone(payload)};
}
