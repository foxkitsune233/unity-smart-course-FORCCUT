# Imported model sources

Kenney Nature Kit 2.1, downloaded 2026-11-03 from https://kenney.nl/assets/nature-kit .
Original author: Kenney. License: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/ .
Original license is included as License.txt. Models selected: tree_pineDefaultA.fbx, rock_largeA.fbx, tent_smallOpen.fbx.
These are visual scenery only; the experiment colliders and scripts remain on their original teaching objects.

## Experiment props (2026-11-03)

Nature Kit: sign.fbx, pot_large.fbx, log_stack.fbx, statue_obelisk.fbx,
crop_melon.fbx, bridge_wood.fbx. Same original CC0 license as above.

Kenney official Starter Kit 3D Platformer:
https://github.com/KenneyNL/Starter-Kit-3D-Platformer .
The upstream README explicitly licenses included art assets CC0; retained in
Character-License.md. character.glb, coin.glb and flag.glb were converted to
OBJ geometry with Tools/convert-kenney-character.cjs (no texture dependency).

CourseVisuals maps humanoids to players/vector movers, coins to collectibles,
flags to finish gates, pots to emitters/effect sources, melons to projectile
and pool-item visuals, signs to targets/health-panel markers, stacked supplies
to inventory markers, and obelisks to score/save-state control markers.
LAB06 uses the humanoid under the original Visual animation binding, so real
Idle/Walk/Jump clips continue to move the visual. Physics spheres, grounds,
trigger volumes and parent coordinate frames retain their instructional forms.
