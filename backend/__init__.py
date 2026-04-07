"""
Pixel Office Backend - OpenClaw Gateway Integration Module

This package provides FastAPI router and utilities for integrating
Pixel Office with the OpenClaw gateway.
"""

from .router import (
    create_pixel_office_router,
    mount_static_files,
    update_agent_state,
    get_agent_status,
    office_manager,
    PixelOfficeManager,
    FRONTEND_DIR,
    CONFIG_DIR,
)

__all__ = [
    "create_pixel_office_router",
    "mount_static_files", 
    "update_agent_state",
    "get_agent_status",
    "office_manager",
    "PixelOfficeManager",
    "FRONTEND_DIR",
    "CONFIG_DIR",
]

__version__ = "0.1.0"