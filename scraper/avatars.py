import asyncio
import json
import os
import sys
import time

from telethon.errors import FloodWaitError

from pstore import collect_last_ids, load_options
from profiles import resolve_senders
from storage import _atomic_write


class _Stop(Exception):
    def __init__(self, seconds):
        super().__init__(seconds)
        self.seconds = seconds


def _load_index(path):
    idx = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            idx = json.load(fh)
    if not isinstance(idx, dict):
        raise ValueError("头像索引格式错误：" + path)
    chat = idx.get("chat")
    ok = idx.get("ok")
    no = idx.get("no")
    return (
        chat if isinstance(chat, dict) else None,
        dict(ok) if isinstance(ok, dict) else {},
        dict(no) if isinstance(no, dict) else {},
    )


def _dump_index(path, chat, ok, no):
    idx = {}
    if chat is not None:
        idx["chat"] = chat
    idx["ok"] = ok
    idx["no"] = no
    _atomic_write(path, idx)


def _remove(path):
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


async def _retry(deadline, make):
    retries = 0
    while True:
        try:
            return await make()
        except FloodWaitError as e:
            wait = e.seconds + 1
            if wait > deadline - time.monotonic() or retries >= 3:
                raise _Stop(e.seconds)
            retries += 1
            await asyncio.sleep(wait)


def _pick_users(last_ids, ok, no, now, refresh_days, limit):
    if limit <= 0:
        return []
    span = refresh_days * 86400
    missing = []
    expired = []
    for uid, mid in last_ids.items():
        key = str(uid)
        if key in ok or key in no:
            ts = ok[key] if key in ok else no[key]
            if now - ts >= span:
                expired.append((ts, uid))
        else:
            missing.append((-mid, uid))
    missing.sort()
    expired.sort()
    result = [t[1] for t in missing] + [t[1] for t in expired]
    return result[:limit]


async def sync_avatars(client, entity, store, deadline):
    tag = "[%s]" % store.username
    try:
        if time.monotonic() >= deadline:
            return
        opts = load_options()
        refresh_days = opts["refresh_days"]
        base = os.path.join(store.data_dir, store.username, "avatars")
        index_path = os.path.join(base, "index.json")
        chat, ok, no = _load_index(index_path)
        os.makedirs(base, exist_ok=True)
        state = {"dirty": False}
        added = empty = 0

        def flush():
            if state["dirty"]:
                _dump_index(index_path, chat, ok, no)
                state["dirty"] = False

        try:
            now = int(time.time())
            if chat is None or now - chat.get("ts", 0) > refresh_days * 86400:
                chat_path = os.path.join(base, "chat.jpg")
                got = await _retry(
                    deadline,
                    lambda: client.download_profile_photo(
                        entity, file=chat_path, download_big=False
                    ),
                )
                await asyncio.sleep(0.5)
                if got:
                    chat = {"ts": int(time.time()), "ok": 1}
                    added += 1
                else:
                    _remove(chat_path)
                    chat = {"ts": int(time.time()), "ok": 0}
                    empty += 1
                state["dirty"] = True
                flush()

            if time.monotonic() < deadline:
                last_ids = collect_last_ids(store)
                targets = _pick_users(
                    last_ids, ok, no, int(time.time()), refresh_days, opts["max_per_run"]
                )
                if targets:
                    senders = await _retry(
                        deadline,
                        lambda: resolve_senders(
                            client, entity, {uid: last_ids[uid] for uid in targets}
                        ),
                    )
                    done = 0
                    for uid in targets:
                        if time.monotonic() >= deadline:
                            break
                        key = str(uid)
                        path = os.path.join(base, key + ".jpg")
                        sender = senders.get(uid)
                        got = None
                        if sender is not None:
                            got = await _retry(
                                deadline,
                                lambda: client.download_profile_photo(
                                    sender, file=path, download_big=False
                                ),
                            )
                            await asyncio.sleep(0.5)
                        now = int(time.time())
                        if got:
                            ok[key] = now
                            no.pop(key, None)
                            added += 1
                        else:
                            _remove(path)
                            no[key] = now
                            ok.pop(key, None)
                            empty += 1
                        state["dirty"] = True
                        done += 1
                        if done % 50 == 0:
                            flush()
        except _Stop as e:
            print("%s 头像：FloodWait %d 秒，停止" % (tag, e.seconds), flush=True)
        finally:
            flush()
        print("%s 头像：新增 %d，无头像 %d" % (tag, added, empty), flush=True)
    except Exception as e:
        print("[%s] 头像同步出错：%s: %s" % (store.username, type(e).__name__, e), file=sys.stderr, flush=True)
