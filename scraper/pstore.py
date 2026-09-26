import argparse
import json
import os
import sys
import tempfile

from storage import Store, _atomic_write

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REFRESH_DAYS = 30
DEFAULT_MAX_PER_RUN = 200


class ProfileStore:
    def __init__(self, data_dir, username):
        self.path = os.path.join(data_dir, username, "users.json")
        self.users = self._load()
        self._dirty = False

    def _load(self):
        if not os.path.exists(self.path):
            return {}
        with open(self.path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("资料文件格式错误：" + self.path)
        return data

    def get(self, uid):
        return self.users.get(str(uid))

    def put(self, uid, rec):
        self.users[str(uid)] = rec
        self._dirty = True

    def flush(self):
        if not self._dirty:
            return
        _atomic_write(self.path, self.users)
        self._dirty = False


def load_options(config_path=None):
    if config_path is None:
        config_path = os.path.join(BASE_DIR, "config.json")
    cfg = {}
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    days = cfg.get("profile_refresh_days")
    limit = cfg.get("profile_max_per_run")
    return {
        "refresh_days": DEFAULT_REFRESH_DAYS if days is None else days,
        "max_per_run": DEFAULT_MAX_PER_RUN if limit is None else limit,
    }


def collect_last_ids(store):
    last = {}
    for entry in store.meta["chunks"]:
        path = os.path.join(store.chunks_dir, entry["file"])
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        for msg in data[: entry["count"]]:
            uid = msg.get("u")
            if uid is None:
                continue
            uid = int(uid)
            mid = int(msg["i"])
            if mid > last.get(uid, -1):
                last[uid] = mid
    return last


def pick_targets(last_ids, pstore, now, refresh_days, limit):
    if limit <= 0:
        return []
    missing = []
    expired = []
    span = refresh_days * 86400
    for uid, mid in last_ids.items():
        rec = pstore.get(uid)
        if rec is None:
            missing.append((-mid, -uid, uid))
        else:
            ts = rec.get("ts", 0)
            if now - ts >= span:
                expired.append((ts, uid))
    missing.sort()
    expired.sort()
    result = [t[2] for t in missing] + [t[1] for t in expired]
    return result[:limit]


def _selftest():
    def write_json(path, obj):
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(obj, fh)

    day = 86400
    now = 1800000000

    with tempfile.TemporaryDirectory() as tmp:
        store = Store(tmp, "demo", chunk_size=2)
        msgs = [
            {"i": 1, "d": 1700000001, "u": 100, "t": "a"},
            {"i": 2, "d": 1700000002, "t": "无发送人"},
            {"i": 3, "d": 1700000003, "u": 200, "t": "b"},
            {"i": 4, "d": 1700000004, "u": 100, "t": "c"},
            {"i": 5, "d": 1700000005, "u": 300, "t": "d"},
            {"i": 6, "d": 1700000006, "u": 200, "t": "e"},
            {"i": 7, "d": 1700000007, "u": 400, "t": "f"},
            {"i": 8, "d": 1700000008, "u": 500, "t": "g"},
        ]
        for m in msgs:
            assert store.add(m) is True
        store.flush()

        last_ids = collect_last_ids(store)
        assert last_ids == {100: 4, 200: 6, 300: 5, 400: 7, 500: 8}
        assert all(type(k) is int for k in last_ids)

        store2 = Store(tmp, "demo", chunk_size=2)
        assert collect_last_ids(store2) == last_ids

        empty = Store(tmp, "empty", chunk_size=2)
        assert collect_last_ids(empty) == {}

        ps = ProfileStore(tmp, "demo")
        assert ps.path == os.path.join(tmp, "demo", "users.json")
        assert ps.users == {}
        assert ps.get(100) is None
        ps.flush()
        assert not os.path.exists(ps.path)

        rec100 = {"ts": now - 40 * day, "name": "张三", "bio": "简介"}
        rec200 = {"ts": now - 10 * day, "name": "李四"}
        rec500 = {"ts": now - 30 * day, "x": 1}
        ps.put(100, rec100)
        ps.put("200", rec200)
        ps.put(500, rec500)
        assert ps.get("100") == rec100 and ps.get(100) == rec100
        assert ps.get(200) == rec200 and ps.get("200") == rec200
        assert ps.get(999) is None
        ps.flush()
        assert os.path.exists(ps.path)
        with open(ps.path, "rb") as fh:
            raw = fh.read().decode("utf-8")
        assert "张三" in raw and " " not in raw.replace("张三", "")
        assert not [f for f in os.listdir(os.path.dirname(ps.path)) if f.endswith(".tmp")]

        ps2 = ProfileStore(tmp, "demo")
        assert ps2.users == {"100": rec100, "200": rec200, "500": rec500}
        assert ps2.get(500) == rec500

        mtime = os.stat(ps2.path).st_mtime_ns
        ps2.flush()
        assert os.stat(ps2.path).st_mtime_ns == mtime

        assert pick_targets(last_ids, ps2, now, 30, 100) == [400, 300, 100, 500]
        assert pick_targets(last_ids, ps2, now, 30, 3) == [400, 300, 100]
        assert pick_targets(last_ids, ps2, now, 30, 2) == [400, 300]
        assert pick_targets(last_ids, ps2, now, 30, 1) == [400]
        assert pick_targets(last_ids, ps2, now, 30, 0) == []
        assert pick_targets(last_ids, ps2, now, 31, 100) == [400, 300, 100]
        assert pick_targets(last_ids, ps2, now, 5, 100) == [400, 300, 100, 500, 200]
        assert pick_targets(last_ids, ps2, now, 5, 4) == [400, 300, 100, 500]
        assert pick_targets(last_ids, ps2, now, 41, 100) == [400, 300]
        assert pick_targets({}, ps2, now, 30, 100) == []
        assert all(type(u) is int for u in pick_targets(last_ids, ps2, now, 5, 100))

        for uid in (400, 300):
            ps2.put(uid, {"ts": now})
        assert pick_targets(last_ids, ps2, now, 30, 100) == [100, 500]

        bad_dir = os.path.join(tmp, "bad")
        os.makedirs(bad_dir)
        with open(os.path.join(bad_dir, "users.json"), "w", encoding="utf-8") as fh:
            fh.write("{坏了")
        try:
            ProfileStore(tmp, "bad")
        except ValueError:
            pass
        else:
            raise AssertionError("损坏的资料文件应抛异常")

        list_dir = os.path.join(tmp, "lst")
        os.makedirs(list_dir)
        write_json(os.path.join(list_dir, "users.json"), [1, 2])
        try:
            ProfileStore(tmp, "lst")
        except ValueError:
            pass
        else:
            raise AssertionError("非 dict 的资料文件应抛异常")

        cfg_missing = os.path.join(tmp, "cfg_missing.json")
        write_json(cfg_missing, {"chats": ["demo"], "chunk_size": 5000})
        assert load_options(cfg_missing) == {"refresh_days": 30, "max_per_run": 200}

        cfg_full = os.path.join(tmp, "cfg_full.json")
        write_json(cfg_full, {"profile_refresh_days": 7, "profile_max_per_run": 50})
        assert load_options(cfg_full) == {"refresh_days": 7, "max_per_run": 50}

        cfg_part = os.path.join(tmp, "cfg_part.json")
        write_json(cfg_part, {"profile_max_per_run": 20})
        assert load_options(cfg_part) == {"refresh_days": 30, "max_per_run": 20}

        assert set(load_options()) == {"refresh_days", "max_per_run"}
    print("OK")


def main():
    ap = argparse.ArgumentParser(description="资料文件读写与抓取目标选择")
    ap.add_argument("--selftest", action="store_true", help="运行自测")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
    else:
        ap.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
