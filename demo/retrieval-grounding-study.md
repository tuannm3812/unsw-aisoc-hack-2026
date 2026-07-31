# Grounding failures in retrieval-augmented answering: a field study

Internal research note, Applied Retrieval Group. Draft 3.

## Abstract

We instrumented three production question-answering deployments over eleven weeks to
find where retrieval-augmented systems lose user trust. Accuracy was rarely the
binding problem. The binding problem was that users could not check an answer, and so
treated correct answers and incorrect ones the same way.

## Method

We shadowed 34 reviewers across the three deployments and logged 4,181 answer
sessions. Every session recorded retrieval latency, generation latency, the retrieved
spans, and whether the reviewer accepted, edited, or rejected the answer.

## Findings

Retrieval dominated the time users waited. Across the three deployments retrieval
accounted for 68 percent of end-to-end latency, with a median of 1.9 seconds against
0.9 seconds for generation. Teams had been optimising the generation step.

Reviewers rejected answers they could not verify. In shadowing sessions, reviewers
rejected 7 of 9 unsourced summaries even when a later audit confirmed the content was
correct. Reviewers described the unsourced answers as "unusable" rather than "wrong".

Chunking destroyed cross-sentence claims. Fixed 512-token chunks split 23 percent of
multi-sentence claims across a boundary, and answers drawing on a split claim were
2.4 times more likely to be edited. Reintroducing a 15 percent overlap between
adjacent chunks recovered most of the lost context and cut the edit rate to near the
unsplit baseline.

Confidence scores were ignored. Reviewers reported that numeric confidence had no
effect on their decision, because the number did not tell them what to check.

## Constraints on any implementation

Every generated claim must cite the source span it came from. A claim without a
retrievable span is treated as unusable by the review team, regardless of accuracy.

End-to-end answer latency must stay under 2.5 seconds at the 95th percentile.
Reviewers abandoned sessions above that threshold in 41 percent of cases.

Citations must resolve to a location a reviewer can open, not to a document name. In
pilot two, document-level citations produced the same rejection rate as no citation
at all.

The system must degrade to extractive quoting when retrieval confidence is low,
rather than generating an unsourced summary.

## Limitations

All three deployments served internal reviewers rather than end customers, so the
verification behaviour we measured may be stronger than in a consumer setting. We did
not test multilingual retrieval.
