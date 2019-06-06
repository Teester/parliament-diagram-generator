# parliament-diagram-generator
Generate parliament diagrams using information from wikidata

Wikidata items for the members of parliament need to contain position held (P39) statements with all of the following qualifiers in order for the tool to work:

    start time (P580)
    end dates (P582)
    parliamentary term (P2937)
    parliamentary group (P4100)

In addition, for colours to appear on the chart, the item for the parliamentary group must have an sRGB color hex triplet (P465) statement. Items without this statement will appear in black.
