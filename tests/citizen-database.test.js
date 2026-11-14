import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { parseArchiveTable } from '../src/api/spherex.js';
const reporter = '11111111-1111-4111-8111-111111111111',
  reviewer = '22222222-2222-4222-8222-222222222222';
const candidateId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const frames = parseArchiveTable(
  readFileSync(new URL('./fixtures/spherex-sia.tsv', import.meta.url), 'utf8')
);
const mark = {
  ...frames[0],
  ra: 304.69,
  dec: 42.44,
  view: { ra: 304.69, dec: 42.44, fov: 1 },
  imageVersion: 'spherex-image-hdu-v1',
  imageHash: 'a'.repeat(64),
};

test('PostgreSQL migration enforces identity, provenance, self-review, duplicate votes, and immutable status', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; insert into auth.users values ('${reporter}'),('${reviewer}');`
    );
    await db.exec(
      readFileSync(
        new URL('../supabase/migrations/20261114125621_citizen_science.sql', import.meta.url),
        'utf8'
      )
    );
    const actAs = async id => {
      await db.exec('reset role; set role authenticated;');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    const insert = async (observations, type = 'artifact', user = reporter) =>
      db.query(
        "insert into public.candidates(id,user_id,ra,dec,center_ra,center_dec,fov,type,confidence,observations) values ($1,$2,304.69,42.44,304.69,42.44,1,$3,'low',$4)",
        [candidateId, user, type, JSON.stringify(observations)]
      );
    await actAs(reporter);
    await assert.rejects(insert([{ ...mark, isMock: true }]));
    await assert.rejects(insert([{ ...mark, view: { ra: null, dec: 0, fov: 1 } }]));
    await assert.rejects(insert([mark], 'moving'));
    await assert.rejects(insert([mark], 'artifact', reviewer));
    await insert([mark]);
    await assert.rejects(
      db.query("update public.candidates set status='needs_investigation' where id=$1", [
        candidateId,
      ])
    );
    await assert.rejects(
      db.query(
        "insert into public.classifications(candidate_id,user_id,verdict) values ($1,$2,'agree')",
        [candidateId, reporter]
      )
    );
    await actAs(reviewer);
    await assert.rejects(
      db.query(
        "insert into public.classifications(candidate_id,user_id,verdict) values ($1,$2,'agree')",
        [candidateId, reporter]
      )
    );
    await db.query(
      "insert into public.classifications(candidate_id,user_id,verdict) values ($1,$2,'unsure')",
      [candidateId, reviewer]
    );
    await assert.rejects(
      db.query(
        "insert into public.classifications(candidate_id,user_id,verdict) values ($1,$2,'agree')",
        [candidateId, reviewer]
      )
    );
    const result = await db.query(
      'select review_count,unsure_count,agreement from public.candidate_summary'
    );
    assert.equal(result.rows[0].review_count, 1);
    assert.equal(result.rows[0].unsure_count, 1);
    assert.equal(result.rows[0].agreement, null);
    await db.exec('reset role; set role anon;');
    assert.equal((await db.query('select count(*) from public.candidates')).rows[0].count, 1);
    await assert.rejects(insert([mark]));
    await assert.rejects(db.exec('delete from public.candidates'));
  } finally {
    await db.close();
  }
});
