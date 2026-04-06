#!/usr/bin/env python3
"""
Generate placeholder pixel sprites for Pixel Office agents.

This script creates simple colored circles/squares as placeholder sprites
until proper pixel art is created or sourced.

Usage:
    python scripts/generate_sprites.py
    
Output:
    frontend/assets/sprites/*.png
"""

from PIL import Image, ImageDraw
import os
from pathlib import Path

# Sprite configurations
SPRITES_DIR = Path(__file__).parent.parent / "frontend" / "assets" / "sprites"

AGENTS = {
    "cortex": {"color": "#00FFFF", "name": "Cortex"},
    "scout": {"color": "#FF9900", "name": "Scout"},
    "builder": {"color": "#00FF00", "name": "Builder"},
    "architect": {"color": "#FF00FF", "name": "Architect"},
    "quick": {"color": "#FFFF00", "name": "Quick"},
    "analyst": {"color": "#0099FF", "name": "Analyst"},
}

# Furniture sprites
FURNITURE = {
    "desk": {"color": "#4A4A6A", "size": (60, 40)},
    "chair": {"color": "#2A2A3A", "size": (30, 20)},
    "couch": {"color": "#4A4A4A", "size": (100, 40)},
    "coffee_machine": {"color": "#8B4513", "size": (50, 60)},
}

def hex_to_rgb(hex_color: str) -> tuple:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def create_agent_sprite(agent_id: str, config: dict, size: int = 32):
    """Create a simple circular sprite for an agent."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw a filled circle
    rgb = hex_to_rgb(config['color'])
    draw.ellipse([4, 4, size-5, size-5], fill=rgb + (255,))
    
    # Add a border
    draw.ellipse([4, 4, size-5, size-5], outline=(255, 255, 255, 200), width=2)
    
    return img


def create_furniture_sprite(furniture_id: str, config: dict):
    """Create a simple furniture sprite."""
    size = config['size']
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    rgb = hex_to_rgb(config['color'])
    draw.rectangle([0, 0, size[0]-1, size[1]-1], fill=rgb + (255,), outline=(255, 255, 255, 100))
    
    return img


def main():
    # Ensure output directory exists
    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("Generating placeholder sprites...")
    
    # Generate agent sprites
    for agent_id, config in AGENTS.items():
        sprite = create_agent_sprite(agent_id, config)
        sprite_path = SPRITES_DIR / f"{agent_id}.png"
        sprite.save(sprite_path)
        print(f"  ✓ {config['name']} -> {sprite_path.name}")
        
        # Also generate state variants
        for state in ['active', 'idle', 'sleeping']:
            variant = sprite.copy()
            # Adjust brightness/alpha based on state
            if state == 'idle':
                variant = variant.point(lambda p: p * 0.7 if p > 0 else 0)
            elif state == 'sleeping':
                variant = variant.point(lambda p: p * 0.4 if p > 0 else 0)
            
            variant_path = SPRITES_DIR / f"{agent_id}_{state}.png"
            variant.save(variant_path)
    
    # Generate furniture sprites
    for furniture_id, config in FURNITURE.items():
        sprite = create_furniture_sprite(furniture_id, config)
        sprite_path = SPRITES_DIR / f"{furniture_id}.png"
        sprite.save(sprite_path)
        print(f"  ✓ {furniture_id} -> {sprite_path.name}")
    
    print(f"\n✅ Generated {len(AGENTS) * 4 + len(FURNITURE)} sprites in {SPRITES_DIR}")


if __name__ == "__main__":
    main()