"""
Demo-mode simulation.

* `daily`      keeps the data set current by simulating each missing day
* `sensors`    stands in for the Arduino with simulated sensor readings
* `scenarios`  visitor-triggered events, undone automatically
* `runner`     the background loop that drives all of the above

Everything that writes demo data holds `SIMULATION_LOCK`, so the background
loop, scenario requests and a full regeneration never interleave.
"""
import threading

SIMULATION_LOCK = threading.RLock()
