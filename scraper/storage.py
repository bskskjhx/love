#!/usr/bin/env python3
import argparse
import json
import os
import sys
import tempfile
import time

FIELDS = ("i", "d", "u", "n", "t", "r", "f", "m", "e", "g", "mw", "mh", "dur", "doc", "sz", "pl", "geo", "ct", "wp")


def _dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _atomic_write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(_dumps(obj))
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def _preview(rec):
    name = rec.get("n")
    if not name:
        u = rec.get("u")
        name = "用户" + str(u) if u is not None else "未知"
    t = rec.get("t")
    m = rec.get("m")
    if t:
        body = " ".join(t.split())[:40]
        if len(t) > 40:
            body += "…"
    elif m:
        body = "[" + m + "]"
    else:
        return ""
    return name + ": " + body


class Store:
    def __init__(self, data_dir, username, chunk_size=5000):
        if chunk_size < 1:
            raise ValueError("chunk_size 必须 >= 1")
        self.data_dir = data_dir
        self.username = username
        self.dir = os.path.join(data_dir, username)
        self.chunks_dir = os.path.join(self.dir, "chunks")
        self.meta_path = os.path.join(self.dir, "meta.json")
        self.meta = self._load_meta(chunk_size)
        self._cache = {}
        self._dirty = set()
        self._meta_dirty = False

    @property
    def last_id(self):
        return self.meta["last_id"]

    @property
    def count(self):
        return self.meta["count"]

    @property
    def title(self):
        return self.meta["title"]

    @property
    def last_date(self):
        return self.meta["last_date"]

    @property
    def chunk_size(self):
        return self.meta["chunk_size"]

    def _load_meta(self, chunk_size):
        meta = {
            "chat_id": None,
            "username": self.username,
            "title": None,
            "chunk_size": chunk_size,
            "count": 0,
            "last_id": 0,
            "first_date": None,
            "last_date": None,
            "updated": 0,
            "chunks": [],
            "pinned_id": None,
        }
        if os.path.exists(self.meta_path):
            with open(self.meta_path, "r", encoding="utf-8") as fh:
                old = json.load(fh)
            meta.update(old)
            meta["username"] = self.username
            if not meta.get("chunk_size"):
                meta["chunk_size"] = chunk_size
        return meta

    def _load_chunk(self, entry):
        name = entry["file"]
        data = self._cache.get(name)
        if data is None:
            path = os.path.join(self.chunks_dir, name)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
            else:
                data = []
            if len(data) > entry["count"]:
                data = data[: entry["count"]]
            if len(data) < entry["count"]:
                raise RuntimeError("chunk 文件损坏或缺失：" + path)
            self._cache[name] = data
        return data

    def last_record(self):
        chunks = self.meta["chunks"]
        if not chunks:
            return None
        try:
            data = self._load_chunk(chunks[-1])
            if not data:
                return None
            return data[-1]
        except Exception:
            return None

    def set_info(self, chat_id, title):
        if self.meta["chat_id"] != chat_id or self.meta["title"] != title:
            self.meta["chat_id"] = chat_id
            self.meta["title"] = title
            self._meta_dirty = True

    def set_pinned(self, msg_id):
        if self.meta.get("pinned_id") != msg_id:
            self.meta["pinned_id"] = msg_id
            self._meta_dirty = True

    def add(self, msg):
        try:
            mid = int(msg["i"])
        except (KeyError, TypeError, ValueError):
            return False
        if mid <= self.meta["last_id"]:
            return False

        rec = {"i": mid}
        for k in FIELDS[1:]:
            v = msg.get(k)
            if v is None or v == "":
                continue
            rec[k] = v

        chunks = self.meta["chunks"]
        if not chunks or chunks[-1]["count"] >= self.meta["chunk_size"]:
            entry = {
                "file": "%05d.json" % len(chunks),
                "count": 0,
                "first_id": mid,
                "last_id": mid,
                "first_date": None,
                "last_date": None,
            }
            chunks.append(entry)
            self._cache[entry["file"]] = []
        else:
            entry = chunks[-1]

        self._load_chunk(entry).append(rec)
        entry["count"] += 1
        entry["last_id"] = mid

        d = rec.get("d")
        if d is not None:
            if entry["first_date"] is None:
                entry["first_date"] = d
            entry["last_date"] = d
            if self.meta["first_date"] is None:
                self.meta["first_date"] = d
            self.meta["last_date"] = d

        self.meta["count"] += 1
        self.meta["last_id"] = mid
        self._dirty.add(entry["file"])
        self._meta_dirty = True
        return True

    def flush(self):
        if not self._dirty and not self._meta_dirty:
            return
        for name in sorted(self._dirty):
            _atomic_write(os.path.join(self.chunks_dir, name), self._cache[name])
        self._dirty.clear()
        self.meta["updated"] = int(time.time())
        _atomic_write(self.meta_path, self.meta)
        self._meta_dirty = False
        chunks = self.meta["chunks"]
        last = chunks[-1]["file"] if chunks else None
        self._cache = {k: v for k, v in self._cache.items() if k == last}


def write_index(data_dir, stores):
    items = []
    for s in stores:
        rec = s.last_record()
        items.append(
            {
                "username": s.username,
                "title": s.title or s.username,
                "count": s.count,
                "last_date": s.last_date,
                "lp": _preview(rec) if rec else "",
            }
        )
    _atomic_write(os.path.join(data_dir, "chats.json"), items)


def _selftest():
    def mk(i):
        return {"i": i, "d": 1700000000 + i, "u": 1, "n": "用户", "t": "消息%d" % i}

    with tempfile.TemporaryDirectory() as tmp:
        chunks_dir = os.path.join(tmp, "demo", "chunks")

        s = Store(tmp, "demo", chunk_size=5)
        assert s.last_id == 0
        s.set_info(123, "演示群")
        assert s.add({"i": 10, "d": 1700000010, "t": None, "n": ""}) is True
        for k in range(2, 8):
            assert s.add(mk(k * 10)) is True
        s.flush()
        assert sorted(os.listdir(chunks_dir)) == ["00000.json", "00001.json"]
        with open(os.path.join(chunks_dir, "00000.json"), "rb") as fh:
            chunk0_bytes = fh.read()
        assert json.loads(chunk0_bytes.decode("utf-8"))[0] == {"i": 10, "d": 1700000010}
        assert "消息" in chunk0_bytes.decode("utf-8")

        s2 = Store(tmp, "demo", chunk_size=5)
        assert s2.last_id == 70 and s2.count == 7
        assert s2.add(mk(70)) is False
        for k in range(8, 13):
            assert s2.add(mk(k * 10)) is True
        s2.flush()

        assert sorted(os.listdir(chunks_dir)) == ["00000.json", "00001.json", "00002.json"]
        with open(os.path.join(chunks_dir, "00000.json"), "rb") as fh:
            assert fh.read() == chunk0_bytes
        assert not [f for f in os.listdir(chunks_dir) if f.endswith(".tmp")]

        with open(os.path.join(tmp, "demo", "meta.json"), "r", encoding="utf-8") as fh:
            meta = json.load(fh)
        assert meta["chat_id"] == 123 and meta["title"] == "演示群"
        assert meta["username"] == "demo" and meta["chunk_size"] == 5
        assert meta["count"] == 12 and meta["last_id"] == 120
        assert meta["first_date"] == 1700000010 and meta["last_date"] == 1700000120
        assert meta["updated"] > 0
        assert [c["file"] for c in meta["chunks"]] == ["00000.json", "00001.json", "00002.json"]
        assert [c["count"] for c in meta["chunks"]] == [5, 5, 2]
        assert [c["first_id"] for c in meta["chunks"]] == [10, 60, 110]
        assert [c["last_id"] for c in meta["chunks"]] == [50, 100, 120]
        assert meta["chunks"][2]["first_date"] == 1700000110
        assert meta["chunks"][2]["last_date"] == 1700000120

        ids = []
        for c in meta["chunks"]:
            with open(os.path.join(chunks_dir, c["file"]), "r", encoding="utf-8") as fh:
                data = json.load(fh)
            assert len(data) == c["count"] <= 5
            ids.extend(m["i"] for m in data)
        assert ids == sorted(ids) and len(ids) == len(set(ids)) == 12

        write_index(tmp, [s2])
        with open(os.path.join(tmp, "chats.json"), "r", encoding="utf-8") as fh:
            assert json.load(fh) == [
                {
                    "username": "demo",
                    "title": "演示群",
                    "count": 12,
                    "last_date": 1700000120,
                    "lp": "用户: 消息120",
                }
            ]
        assert _preview({"i": 1, "u": 5, "m": "photo"}) == "用户5: [photo]"
        assert _preview({"i": 1}) == ""
        assert _preview({"n": "甲", "t": "a" * 50}) == "甲: " + "a" * 40 + "…"
    print("OK")


def main():
    ap = argparse.ArgumentParser(description="分块只追加存储")
    ap.add_argument("--selftest", action="store_true", help="运行自测")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
    else:
        ap.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
