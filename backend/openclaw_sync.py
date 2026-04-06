#!/usr/bin/env python3
"""
OpenClaw Integration for Pixel Office

Polls OpenClaw gateway for agent status and updates the Pixel Office state.
"""

import asyncio
import json
import httpx
from datetime import datetime
from typing import Dict, Optional

# OpenClaw Gateway URL
GATEWAY_URL = "http://127.0.0.1:18789"
GATEWAY_TOKEN = None  # Set from gateway.env if needed

# Import from server
import sys
sys.path.insert(0, '/home/distiller/.openclaw/workspace/pixel-office/backend')
from server import agent_states, update_agent_state


async def get_gateway_status() -> Dict:
    """Get agent status from OpenClaw gateway."""
    try:
        async with httpx.AsyncClient() as client:
            # Get heartbeat status for main agent
            resp = await client.get(f"{GATEWAY_URL}/status", timeout=5.0)
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        print(f"Error getting gateway status: {e}")
    return {}


async def get_subagent_status() -> Dict:
    """Get subagent status from OpenClaw."""
    try:
        async with httpx.AsyncClient() as client:
            # List subagents
            resp = await client.post(
                f"{GATEWAY_URL}/subagents",
                json={"action": "list"},
                timeout=5.0
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        print(f"Error getting subagent status: {e}")
    return {}


def map_heartbeat_to_state(heartbeat_data: Optional[Dict]) -> str:
    """Map OpenClaw heartbeat status to Pixel Office state."""
    if not heartbeat_data:
        return "offline"
    
    status = heartbeat_data.get("status", "unknown")
    
    # Map heartbeat status to pixel office states
    if status == "active" or heartbeat_data.get("processing"):
        return "active"
    elif status == "thinking":
        return "thinking"
    elif status == "idle":
        return "idle"
    elif status == "sleeping":
        return "sleeping"
    else:
        return "offline"


async def sync_agent_states():
    """Sync agent states from OpenClaw to Pixel Office."""
    print("🔄 Starting OpenClaw sync...")
    
    # Get main agent (Cortex) status
    gateway_status = await get_gateway_status()
    
    if gateway_status:
        # Map main agent status
        main_state = map_heartbeat_to_state(gateway_status.get("main"))
        update_agent_state("cortex", main_state, gateway_status.get("current_task"))
        print(f"  Cortex: {main_state}")
    
    # Get subagent status
    subagent_data = await get_subagent_status()
    
    if subagent_data and "subagents" in subagent_data:
        for sa in subagent_data["subagents"]:
            agent_id = sa.get("agentId", "").lower()
            if agent_id in agent_states:
                state = map_heartbeat_to_state(sa)
                task = sa.get("current_task") if state == "active" else None
                update_agent_state(agent_id, state, task)
                print(f"  {agent_id}: {state}")


async def main():
    """Main loop - sync every 5 seconds."""
    print("🎮 Pixel Office - OpenClaw Integration")
    print("Connecting to OpenClaw gateway...")
    
    while True:
        try:
            await sync_agent_states()
        except Exception as e:
            print(f"Sync error: {e}")
        
        await asyncio.sleep(5)  # Poll every 5 seconds


if __name__ == "__main__":
    asyncio.run(main())