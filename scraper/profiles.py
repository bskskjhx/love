import asyncio
import sys
import time

from telethon.errors import FloodWaitError
from telethon.tl.functions.users import GetFullUserRequest

from precord import sender_to_record, unresolved_record
from pstore import ProfileStore, collect_last_ids, load_options, pick_targets


async def resolve_senders(client, entity, last_ids):
    found = {}
    ids = list(last_ids.values())
    for i in range(0, len(ids), 100):
        batch = ids[i:i + 100]
        msgs = await client.get_messages(entity, ids=batch)
        for msg in msgs:
            if msg is None:
                continue
            sid = msg.sender_id
            if sid in last_ids and msg.sender is not None:
                found[sid] = msg.sender
        if i + 100 < len(ids):
            await asyncio.sleep(0.3)
    return found


async def fetch_about(client, sender):
    if not hasattr(sender, "first_name"):
        return None
    full = await client(GetFullUserRequest(sender))
    info = getattr(full, "full_user", full)
    return getattr(info, "about", None)


async def sync_profiles(client, entity, store, deadline):
    tag = "[%s]" % store.username
    try:
        if time.monotonic() >= deadline:
            return
        opts = load_options()
        pstore = ProfileStore(store.data_dir, store.username)
        last_ids = collect_last_ids(store)
        targets = pick_targets(
            last_ids, pstore, int(time.time()), opts["refresh_days"], opts["max_per_run"]
        )
        if not targets:
            print("%s 资料：无需更新" % tag, flush=True)
            return
        try:
            senders = await resolve_senders(client, entity, {uid: last_ids[uid] for uid in targets})
        except FloodWaitError as e:
            print("%s 资料：FloodWait %d 秒，跳过本次同步" % (tag, e.seconds), flush=True)
            return
        added = refreshed = unresolved = done = 0
        try:
            for uid in targets:
                if time.monotonic() >= deadline:
                    break
                now = int(time.time())
                old = pstore.get(uid)
                sender = senders.get(uid)
                if sender is None:
                    if old is not None and not old.get("x"):
                        rec = dict(old)
                        rec["ts"] = now
                        pstore.put(uid, rec)
                    else:
                        pstore.put(uid, unresolved_record(now))
                    unresolved += 1
                else:
                    about = None
                    retries = 0
                    failed = False
                    while True:
                        try:
                            about = await fetch_about(client, sender)
                            break
                        except FloodWaitError as e:
                            wait = e.seconds + 1
                            if wait > deadline - time.monotonic() or retries >= 3:
                                print("%s 资料：FloodWait %d 秒，停止" % (tag, e.seconds), flush=True)
                                failed = True
                                break
                            retries += 1
                            await asyncio.sleep(wait)
                    if failed:
                        break
                    pstore.put(uid, sender_to_record(sender, about, now))
                    if old is None:
                        added += 1
                    else:
                        refreshed += 1
                    await asyncio.sleep(0.5)
                done += 1
                if done % 50 == 0:
                    pstore.flush()
        finally:
            pstore.flush()
        print("%s 资料：新增 %d，刷新 %d，未解析 %d" % (tag, added, refreshed, unresolved), flush=True)
    except Exception as e:
        print("%s 资料同步出错：%s: %s" % (tag, type(e).__name__, e), file=sys.stderr, flush=True)
