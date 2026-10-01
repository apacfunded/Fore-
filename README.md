# Fore! ($FORE)

A live golf game for $FORE. Players post a callout on pump.fun, paste the link plus the Solana address they want paid to, and get a ball on the tee. Everyone on the tee swings together each round, and the hole in one wins 10% of the pool, up to 0.5 SOL per win. The bigger the pool, the faster rounds come. You send winnings yourself and mark them paid on the admin page.

Nobody connects a wallet, and the site never holds any keys.

## How it works

- **The courses**: every round is a 740-yard, three-stage par 5, rendered in 3D with three.js (the 2D side view is used automatically on devices without WebGL). Balls tee off over the first hazard; the ones that make it roll onto a glowing launch pad and get fired into the next stage, then again toward the green. Balls can go out in a hazard or stop short of a pad along the way. There are four themed maps, and each round's map comes from its seed, so every viewer sees the same one:
  - **Greenway Links**: lake, river and pond
  - **Dune Run**: quicksand, a canyon gap and a sinkhole
  - **Glacier Peak**: crevasses and a frozen lake
  - **Magma Isle**: lava rivers under a volcano

  Each fairway also has a themed obstacle in front of its launch pad that balls have to get past, and some don't:
  - Greenway Links: a windmill (roll through the tunnel or get knocked back) and a spinning sprinkler arm
  - Dune Run: rolling tumbleweeds and a sandworm that eats balls
  - Glacier Peak: a snowman and rising ice spikes that freeze balls in a block of ice
  - Magma Isle: a fire geyser that blasts balls away and a rolling boulder

  Every course runs downhill from tee to green, so balls carry their speed out of each bounce, pick up pace down the fairways, and slow as they climb onto the launch pads. The 3D view has real-time shadows, a gradient sky, textured ground, and dimpled balls that visibly spin as they roll.

  While a round plays, a play-by-play feed on the course calls what happens to each ball. Your own ball (the address you entered with) is orange, ringed and tagged "YOU" so you can follow it, and it's marked in the results. Optional sound effects (swing, splash, lava, bonk, the cheer for a hole in one) are synthesized in the browser and turned on with the button on the course. Winners get a one-tap "Share on X" button next to their win, and the browser tab shows the countdown to the next tee off.

  A camera flies over the course between rounds, starts behind the tee, chases the lead balls through each stage, cuts to each obstacle as balls reach it, and goes low on the green for the finish. The course and camera code live in `lib/game.ts` (maps and shots), `lib/course3d.ts` and `lib/obstacles3d.ts` (3D), `lib/course.ts` (2D) and `lib/sound.ts` (sound).

- **Entering**: a pump.fun link, a Solana payout address, and an optional name for their ball. One entry per address per round, one entry per internet connection per round, and each callout link can only be used once, ever.
- **Practice until the pool fills**: games run from day one, but until the pool first reaches `MIN_POOL_SOL` (5 SOL by default) every round is a practice round. A winner is still drawn and celebrated, but no payout is queued, and the page tells players payouts start at 5 SOL. Once the pool gets there, wins pay out for good, even after payouts take the pool back under 5. You can switch back to practice from the admin page.
- **Round speed follows the pool**: a big pool plays fast, a small pool slows down so trading fees can refill it. Defaults:

  | Pool | Round every | Most it can pay out per hour |
  | --- | --- | --- |
  | under 10 SOL | 5 min | 6 SOL |
  | 10–25 SOL | 3 min | 10 SOL |
  | 25–50 SOL | 2 min | 15 SOL |
  | 50–100 SOL | 1 min | 30 SOL |
  | 100+ SOL | 30 sec | 60 SOL |

  With a player every round and no new fees, a 50 SOL pool takes about 4 hours to drop to 5 SOL, and a 10 SOL pool under an hour. Below 5 SOL wins keep paying 10% of what's left, so they shrink rather than stop. If the pool grows into a faster tier mid-round, the tee off moves up. Practice rounds run every minute. If nobody enters, the round waits and the pool rolls over.
- **The pool** is an estimate of your creator rewards. About twice a minute the site reads your coin's trading volume from DexScreener and adds `volume × CREATOR_FEE_PCT`, converted to SOL. Winnings you've promised come off the top. Skipped payouts go back in.
- **Picking the winner**: when a round ends, the server reads the latest finalized Solana blockhash, computes `sha256("<blockhash>:<round number>")`, and uses its first 8 hex digits as the seed. `seed mod number_of_balls` is the winner. Every visitor's screen plays the same shots from that seed, and the math is printed under the results so anyone can check it.
- **Payouts**: each win lands on `/admin` with the address and amount. Send the SOL from whatever wallet you like (Phantom, an exchange, anything), then press **Mark paid**. Paste the transaction signature too if you want a Solscan link on the public winners list.

## Setup (about 20 minutes)

You need free accounts on [Supabase](https://supabase.com), [GitHub](https://github.com) and [Vercel](https://vercel.com).

1. **Database**: create a Supabase project. Open SQL Editor → New query, paste all of `supabase/schema.sql`, and press Run.
2. **Keys**: in Supabase go to Project Settings → API. Copy the Project URL and the `service_role` secret key.
3. **Code**: create a new GitHub repo and upload the contents of this folder.
4. **Deploy**: in Vercel choose Add New → Project and import the repo. Before pressing Deploy, open Environment Variables and add each one from `.env.example`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from step 2
   - `TOKEN_MINT`: your coin's contract address
   - `NEXT_PUBLIC_TOKEN_SYMBOL`: your ticker, without the $
   - `CREATOR_FEE_PCT`: `0.30` while on the bonding curve (see below)
   - `STARTING_POOL_SOL`: any creator rewards you've already earned that should be in the pool, or `0`
   - `MIN_POOL_SOL`: `5`, the pool size before wins start paying out
   - `ADMIN_KEY` and `CRON_SECRET`: long random passwords you make up
5. Press Deploy. When it finishes, open the site. The first round starts on the first visit. Your payout page is the same address with `/admin` on the end.

**Domain**: in Vercel open the project → Settings → Domains, add `foregolf.lol`, and follow the DNS instructions it shows (usually an A record pointing to Vercel at your domain registrar). The site already uses foregolf.lol for link previews and share posts.

To try it on your own computer first: `npm install`, copy `.env.example` to `.env.local` and fill it in, run `npm run dev`, and open http://localhost:3000.

## Keeping the pool estimate honest

Pump.fun pays creators 0.30% of every trade on the bonding curve. After your coin graduates to PumpSwap, the rate steps down as market cap grows, to as low as 0.05% ([pump.fun fee docs](https://pump.fun/docs/fees)). When that happens, change `CREATOR_FEE_PCT` in Vercel (Settings → Environment Variables) and redeploy.

The estimate will drift from your real rewards over time, since DexScreener volume isn't an exact match for pump.fun's fee accounting. Now and then, compare the admin page's "Estimated creator fees" line with what pump.fun shows you've earned, and use the correction box to add or remove the difference.

## Handling lots of viewers

The game state endpoint tells Vercel's CDN to cache each response for one second, so the database and DexScreener see about one request per second however many people are watching. The page corrects its countdown for that cache.

## Keeping rounds on time when nobody's watching

Every visitor's browser checks in every 2 seconds, and each check-in settles any round that's due, so rounds run on time whenever someone has the site open. To also run on a fixed heartbeat, add a free job at [cron-job.org](https://cron-job.org) that calls `https://your-site/api/tick` every minute with the header `Authorization: Bearer <your CRON_SECRET>`.

## Settings

| Variable | What it does |
| --- | --- |
| `CREATOR_FEE_PCT` | Creator fee rate used for the pool estimate, in percent. |
| `STARTING_POOL_SOL` | SOL in the pool on day one. |
| `MIN_POOL_SOL` | Rounds are practice (no payouts) until the pool first reaches this. Default 5. |
| `PAYOUT_SHARE` | Share of the pool per win. `0.10` is 10%. |
| `MAX_PAYOUT_SOL` | Most a single win pays. Default 0.5 SOL. |
| `ROUND_TIERS` | Round length by pool size, as `poolSOL:seconds` pairs. |
| `PRACTICE_ROUND_SECONDS` | How often practice rounds run. |
| `SOLANA_RPC_URL` | Only used to read one blockhash per round. The public endpoint is fine. |

## Known limits

- **Callouts aren't opened or read.** The site checks that the link is on pump.fun and hasn't been used before, but not that the post exists or mentions your coin. Glance at winners' links before paying, and Skip anyone gaming it.
- **Farming**: without a wallet check, one person can still enter from several phones or networks with several addresses. The one-per-connection rule slows this down. If it becomes a problem, add a minimum token holding back in.
- **The blockhash seed is good, not perfect.** An on-chain VRF such as Switchboard is the upgrade if the pool gets large.
- **The pool is an estimate**, and the page says so. Keep it in line with your real rewards using the correction box, so you never promise more than you have.
- A recurring cash prize decided by chance can count as a lottery or sweepstakes in some places. Free entry helps, but check before promoting it heavily.
