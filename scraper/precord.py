import argparse
import sys
from types import SimpleNamespace


def _username(sender):
    name = getattr(sender, "username", None)
    if name:
        return name
    for item in getattr(sender, "usernames", None) or []:
        if getattr(item, "active", False) and getattr(item, "username", None):
            return item.username
    return ""


def sender_to_record(sender, about, now):
    is_user = hasattr(sender, "first_name")
    rec = {}
    if is_user:
        first = getattr(sender, "first_name", None) or ""
        last = getattr(sender, "last_name", None) or ""
        name = (first + " " + last).strip()
    else:
        name = (getattr(sender, "title", None) or "").strip()
    if name:
        rec["n"] = name
    un = _username(sender)
    if un:
        rec["un"] = un
    if is_user:
        bio = (about or "").strip()
        if bio:
            rec["b"] = bio
    for key, attr in (("bot", "bot"), ("pr", "premium"), ("vf", "verified"), ("dl", "deleted")):
        if getattr(sender, attr, False):
            rec[key] = 1
    rec["ts"] = now
    return rec


def unresolved_record(now):
    return {"x": 1, "ts": now}


def _check(actual, expected):
    assert actual == expected, "%r != %r" % (actual, expected)
    for key, value in actual.items():
        assert value not in (None, "", 0, False, [], {}), "空值：" + key


def _selftest():
    now = 1700000000

    full = SimpleNamespace(
        first_name="Ann",
        last_name="Lee",
        username="ann",
        usernames=[],
        bot=False,
        premium=True,
        verified=True,
        deleted=False,
    )
    _check(
        sender_to_record(full, "  hello  ", now),
        {"n": "Ann Lee", "un": "ann", "b": "hello", "pr": 1, "vf": 1, "ts": now},
    )

    bot = SimpleNamespace(
        first_name="Helper",
        last_name=None,
        username="helper_bot",
        bot=True,
        premium=False,
        verified=False,
        deleted=False,
    )
    _check(
        sender_to_record(bot, "   ", now),
        {"n": "Helper", "un": "helper_bot", "bot": 1, "ts": now},
    )

    gone = SimpleNamespace(
        first_name=None,
        last_name=None,
        username=None,
        bot=False,
        premium=False,
        verified=False,
        deleted=True,
    )
    _check(sender_to_record(gone, None, now), {"dl": 1, "ts": now})

    multi = SimpleNamespace(
        first_name="Bob",
        last_name=None,
        username=None,
        usernames=[
            SimpleNamespace(username="old_one", active=False),
            SimpleNamespace(username="live_one", active=True),
            SimpleNamespace(username="live_two", active=True),
        ],
        bot=False,
        premium=False,
        verified=False,
        deleted=False,
    )
    _check(
        sender_to_record(multi, "", now),
        {"n": "Bob", "un": "live_one", "ts": now},
    )

    inactive = SimpleNamespace(
        first_name="Cy",
        last_name="Dee",
        username="",
        usernames=[SimpleNamespace(username="off", active=False)],
    )
    _check(sender_to_record(inactive, None, now), {"n": "Cy Dee", "ts": now})

    channel = SimpleNamespace(
        title="  News Room ",
        username="newsroom",
        verified=True,
        bot=False,
        deleted=False,
    )
    _check(
        sender_to_record(channel, "ignored bio", now),
        {"n": "News Room", "un": "newsroom", "vf": 1, "ts": now},
    )

    _check(unresolved_record(now), {"x": 1, "ts": now})
    print("OK")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        _selftest()
        return 0
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
