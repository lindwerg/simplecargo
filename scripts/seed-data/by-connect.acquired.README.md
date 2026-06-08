# by-connect — NOT consolidated as a routing layer (diagnostic only)

`acq-by-connect.json` is a CONNECTIVITY DIAGNOSTIC (verdict REAL, sourced-official),
not a new distance table. It reports that 93.1% (325/349) of БЧ spur-token stations
trace to the sourced-official БЧ backbone (kniga3-backbone-cis.priority.json) and lists
5 RF↔БЧ border стык pairs. Its routing payload is already captured by:
  - cis-spurs.acquired.json   (the station→ТП spur edges themselves)
  - the existing kniga3-backbone-cis.priority.json (БЧ ТП↔ТП backbone)
  - uzel-graph-cisfill.json    (the 5 RF↔БЧ border стыки)
No separate engine file is emitted; nothing actionable beyond what those carry.
