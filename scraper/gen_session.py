#!/usr/bin/env python3
import os
import sys

from telethon.sessions import SQLiteSession, StringSession

DEFAULT_PATH = "/storage/emulated/0/玩耍/session_all/+916379445089.session"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    if not os.path.exists(path):
        sys.exit("找不到 session 文件：" + path)

    s = SQLiteSession(path)
    try:
        if not s.auth_key:
            sys.exit("session 文件里没有登录信息（未登录或已失效）：" + path)
        session_str = StringSession.save(s)
    finally:
        s.close()

    print("\nStringSession 如下（请勿泄露）：\n")
    print(session_str)
    print("\n请把上面这串字符串保存为 GitHub Secret：TG_SESSION")
    print("（仓库 Settings → Secrets and variables → Actions → New repository secret）")


if __name__ == "__main__":
    main()
