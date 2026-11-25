"""In-process publish/subscribe used to push live updates over Server-Sent Events.

Topics:
  location:<location_id>  -> snapshot.updated, feed.created
  user:<uid>              -> notification.created
"""
from __future__ import annotations

import asyncio
import contextlib
import json
from collections import defaultdict
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)

    def subscribe(self, topics: list[str]) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        for t in topics:
            self._subs[t].add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        for subs in self._subs.values():
            subs.discard(q)

    def publish(self, topic: str, event: str, data: Any) -> None:
        msg = f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
        for q in list(self._subs.get(topic, ())):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                # Slow consumer: drop the oldest message rather than block producers.
                with contextlib.suppress(asyncio.QueueEmpty, asyncio.QueueFull):
                    q.get_nowait()
                    q.put_nowait(msg)

    def subscriber_count(self) -> int:
        return len({id(q) for subs in self._subs.values() for q in subs})


bus = EventBus()
