import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import * as db from "../server/db";

import {appRouter} from "../server/routers";
import {users} from "../drizzle/schema";
import {eq} from "drizzle-orm";

async function main(){
 const ids:number[]=[];
 try {
  const guest=await db.createGuestUser();ids.push(guest.id);
  const settings=await db.getUserSettings(guest.id);assert.equal(settings.shareFriendActivity,0);assert.equal(settings.allowFriendNudges,0);
  const list=await db.listExercises(guest.id);const exercise=list.find(x=>x.name==='Bench Press'&&x.equipment==='Barbell')!;assert.ok(exercise);
  const input={clientKey:randomUUID(),unit:'lb' as const,days:3,performedAt:new Date(),durationSeconds:60,name:'First workout',exercises:[{exerciseId:exercise.id,sets:[{targetReps:10,actualReps:10,actualWeight:12.5,rpe:null}]}]};
  const [first,second]=await Promise.all([db.syncGuestWorkout(guest.id,input),db.syncGuestWorkout(guest.id,input)]);assert.equal(first.id,second.id);assert.equal(first.isPrivate,1);assert.equal(first.exercises[0].sets.length,1);assert.equal(first.exercises[0].sets[0].actualWeight,12.5);
  const upgraded=await db.upgradeGuestToEmailUser({userId:guest.id,email:`guest-${randomUUID()}@liftlog.invalid`,displayName:'Guest test',passwordHash:'fixture-not-for-login'});assert.equal(upgraded.id,guest.id);assert.equal((await db.getWorkout(upgraded.id,first.id))?.id,first.id);
  const source=await db.createGuestUser();ids.push(source.id);const sourceInput={...input,clientKey:randomUUID()};const saved=await db.syncGuestWorkout(source.id,sourceInput);
  const invite=await db.getFriendInviteCode(source.id);
  await db.claimGuestData(upgraded.id,source.id);assert.ok(await db.getWorkout(upgraded.id,saved.id));
  const friend=await db.createGuestUser();ids.push(friend.id);await db.redeemFriendInvite(friend.id,invite.code);const hub=await db.getFriendsHub(upgraded.id);assert.equal(hub.incoming.length,1);assert.equal(await db.getWorkout(source.id,saved.id),null);
  const caller=appRouter.createCaller({user:upgraded,req:{} as never,res:{} as never});const replay=await caller.workout.syncGuest({...sourceInput,performedAt:sourceInput.performedAt.toISOString()});assert.equal(replay.id,saved.id);
  await assert.rejects(caller.workout.syncGuest({...sourceInput,clientKey:randomUUID(),performedAt:sourceInput.performedAt.toISOString()}));
  const challengeId=randomUUID();const credentialHash=createHash('sha256').update('test-secret').digest('hex');await db.createAppleAuthChallenge({id:challengeId,nonce:'test-nonce',credentialHash,expiresAt:new Date(Date.now()+60000)});const consumed=await db.consumeAppleAuthChallenge({id:challengeId,credentialHash});assert.equal(consumed.nonce,'test-nonce');await assert.rejects(db.consumeAppleAuthChallenge({id:challengeId,credentialHash}));
  console.log('PASS: guest private defaults, concurrent retries one workout, real 12.5 logged, same-user upgrade, existing-account claim and source denial, post-claim replay.');
 }finally{for(const id of ids){await db.deleteAccountData(id);}const database=await db.getDb();if(database){for(const id of ids)await database.delete(users).where(eq(users.id,id));}}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
