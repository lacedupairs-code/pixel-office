# Motion preferences and phone details

The office follows `prefers-reduced-motion` at startup and when the OS preference
changes. It freezes idle rigs and decorative typing, pulses, screen scrolling,
particles, beams, flashes and rocket effects. Agents still move to their correct
workstations, using immediate position changes. New status poses apply once.
Camera navigation remains available and settles immediately without damping.
Live polling, status updates, and activity continue in reduced motion.

Phones keep the live/demo/reconnecting label below the header. Inspector and
Activity buttons switch the lower panel, with pressed states, keyboard support,
and 44px controls. Desktop continues to show both panels. Long activity text wraps.
The decorative TV also reports the current health summary instead of a fixed
three-app success claim; its sample display is explicitly labeled.

Validation: build, TypeScript lint, five live-UI tests, and the expanded full 3D
browser suite passed using licensed local assets and synthetic HQ responses.
Browser checks cover phone panel switching with click and keyboard, visible phone
status, live recovery, data safety, runtime motion preference changes, frozen rig
animation and settled camera positions. Light and dark phone captures and a reduced
motion desktop capture were checked. Physical phone and screen reader remain untested.
