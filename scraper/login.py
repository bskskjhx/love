"""把固定的 Telethon .session 文件转换成 StringSession，填入 GitHub Secret `TG_SESSION`。

    pip install -r scraper/requirements.txt
    python scraper/login.py

默认读取 SESSION_FILE；也可以用环境变量 TG_SESSION_FILE 覆盖。
提供 TG_API_ID / TG_API_HASH（环境变量或按提示输入）时会连接 Telegram 验证会话是否有效。
"""

import asyncio
import os
import shutil
import sys
import tempfile
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import SQLiteSession, StringSession

SESSION_FILE = Path(os.environ.get("TG_SESSION_FILE") or r"C:\Users\luna\Downloads\+916379445089.session")


def load_string_session(path: Path) -> str:
    """在临时副本上读取，避免 Telethon 改写原始 .session 文件。"""
    if not path.exists():
        sys.exit(f"找不到 session 文件：{path}")
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / "copy.session"
        shutil.copyfile(path, copy)
        session = SQLiteSession(str(copy))
        try:
            if not session.auth_key:
                sys.exit(f"{path} 中没有登录信息（auth_key），无法使用")
            return StringSession.save(session)
        finally:
            session.close()


async def verify(string: str) -> None:
    api_id = os.environ.get("TG_API_ID") or input("API ID（直接回车跳过验证）: ").strip()
    if not api_id:
        print("已跳过在线验证")
        return
    api_hash = os.environ.get("TG_API_HASH") or input("API Hash: ").strip()
    client = TelegramClient(StringSession(string), int(api_id), api_hash)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            sys.exit("会话已失效：该 session 未登录或已被注销")
        me = await client.get_me()
        print(f"验证通过：{me.first_name} (id={me.id})")
    finally:
        await client.disconnect()


async def main() -> None:
    string = load_string_session(SESSION_FILE)
    print(f"已读取 {SESSION_FILE}")
    await verify(string)
    print("\n把下面整行填入 GitHub Secret TG_SESSION（请妥善保管，它等同于账号登录凭据）：\n")
    print(string)


if __name__ == "__main__":
    asyncio.run(main())
