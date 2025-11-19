"""Manual sync script - Run this to sync devices"""
import asyncio
from app.services.sync_service import sync_service

async def main():
    print("Starting manual device sync...")
    await sync_service.sync_all_devices()
    print("Sync completed!")

if __name__ == "__main__":
    asyncio.run(main())
