"""Extraction proposes; a person decides. These tests pin that boundary.

The earlier build wrote a node for everything Mistral named, which turned a single
nine-page paper into 47 cards. What matters now is that a parse adds nothing to the
canvas, and that the proposals it leaves behind are trustworthy: no duplicates, and
no page citation that cannot be opened.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Asset, Board, Candidate, Node, NodeKind, ParseState, new_id
from app.routers.assets import (
    MAX_CANDIDATES_PER_KIND,
    _valid_page,
    _write_extraction,
)
from app.schemas import ExtractedConstraint, ExtractedFinding, ExtractionResult
from app.services.graph import place_promoted_nodes


def make_asset(db: Session, board: Board, pages: int = 9) -> Asset:
    asset = Asset(
        id=new_id("ast"),
        board_id=board.id,
        filename="paper.pdf",
        page_count=pages,
        parse_state=ParseState.parsing.value,
    )
    db.add(asset)
    db.commit()
    return asset


def finding(title: str, page: int | None = 1, confidence: float = 0.9) -> ExtractedFinding:
    return ExtractedFinding(
        title=title, detail="detail", page=page, quote="quote", confidence=confidence
    )


def constraint(title: str, page: int | None = 1, confidence: float = 0.9) -> ExtractedConstraint:
    return ExtractedConstraint(
        title=title, detail="detail", page=page, quote="quote", confidence=confidence
    )


# --------------------------------------------------------------- page validation


def test_page_beyond_the_document_is_dropped():
    """Models report the number printed on the page, which journals start at 601."""
    assert _valid_page(601, 9) is None
    assert _valid_page(20, 9) is None


def test_page_inside_the_document_is_kept():
    assert _valid_page(1, 9) == 1
    assert _valid_page(9, 9) == 9


def test_page_is_dropped_when_the_page_count_is_unknown():
    """Text uploads have no pages, so any number would be unverifiable."""
    assert _valid_page(3, 0) is None


def test_nonsense_pages_are_dropped():
    assert _valid_page(0, 9) is None
    assert _valid_page(-2, 9) is None
    assert _valid_page(None, 9) is None


# ------------------------------------------------------------------- extraction


def test_extraction_adds_nothing_to_the_canvas(db: Session, board: Board):
    asset = make_asset(db, board)
    result = ExtractionResult(
        summary="A paper",
        findings=[finding("Latency dominates")],
        constraints=[constraint("Every claim must cite a source")],
    )

    _write_extraction(db, asset, result, actor_id="usr_1")

    assert db.query(Node).count() == 0
    assert db.query(Candidate).count() == 2
    assert asset.parse_state == ParseState.parsed.value


def test_the_same_claim_is_not_proposed_twice(db: Session, board: Board):
    """A finding restated as a constraint is one fact, not two nodes to review."""
    asset = make_asset(db, board)
    result = ExtractionResult(
        findings=[finding("Benign alert rate drops to 0.029")],
        constraints=[constraint("Benign alert rate drops to 0.029!")],
    )

    _write_extraction(db, asset, result, actor_id="usr_1")

    assert db.query(Candidate).count() == 1


def test_duplicate_titles_differing_only_in_case_collapse(db: Session, board: Board):
    asset = make_asset(db, board)
    result = ExtractionResult(
        findings=[finding("Retrieval Latency Dominates"), finding("retrieval latency dominates")],
    )

    _write_extraction(db, asset, result, actor_id="usr_1")

    assert db.query(Candidate).count() == 1


def test_proposals_are_capped_per_kind(db: Session, board: Board):
    asset = make_asset(db, board)
    result = ExtractionResult(
        findings=[finding(f"Finding {index}") for index in range(40)],
        constraints=[constraint(f"Constraint {index}") for index in range(40)],
    )

    _write_extraction(db, asset, result, actor_id="usr_1")

    for kind in (NodeKind.finding.value, NodeKind.constraint.value):
        assert db.query(Candidate).filter(Candidate.kind == kind).count() == MAX_CANDIDATES_PER_KIND


def test_the_cap_keeps_the_best_supported_proposals(db: Session, board: Board):
    """Truncation has to drop the weakest, not whatever happened to arrive last."""
    asset = make_asset(db, board)
    result = ExtractionResult(
        findings=[
            finding(f"Finding {index}", confidence=index / 100) for index in range(40)
        ],
    )

    _write_extraction(db, asset, result, actor_id="usr_1")

    kept = db.query(Candidate).all()
    assert min(row.confidence for row in kept) > 0.2


def test_out_of_range_pages_survive_as_proposals_without_the_citation(
    db: Session, board: Board
):
    asset = make_asset(db, board, pages=9)
    result = ExtractionResult(findings=[finding("Median wall clock time", page=604)])

    _write_extraction(db, asset, result, actor_id="usr_1")

    proposal = db.query(Candidate).one()
    assert proposal.source_page is None
    assert proposal.source_quote == "quote"


def test_reparse_replaces_proposals_but_keeps_promoted_ones(db: Session, board: Board):
    asset = make_asset(db, board)
    _write_extraction(
        db, asset, ExtractionResult(findings=[finding("Kept"), finding("Dropped")]), "usr_1"
    )

    kept = db.query(Candidate).filter(Candidate.title == "Kept").one()
    kept.promoted_node_id = "nod_already_on_canvas"
    db.commit()

    _write_extraction(db, asset, ExtractionResult(findings=[finding("Fresh")]), "usr_1")

    titles = {row.title for row in db.query(Candidate).all()}
    assert titles == {"Kept", "Fresh"}


def test_reparse_does_not_re_propose_something_already_promoted(db: Session, board: Board):
    """Otherwise the review list keeps offering nodes the user already accepted."""
    asset = make_asset(db, board)
    _write_extraction(db, asset, ExtractionResult(findings=[finding("Already accepted")]), "usr_1")

    promoted = db.query(Candidate).one()
    promoted.promoted_node_id = "nod_x"
    db.commit()

    _write_extraction(db, asset, ExtractionResult(findings=[finding("Already accepted")]), "usr_1")

    assert db.query(Candidate).count() == 1


def test_the_source_node_reports_how_much_is_waiting(db: Session, board: Board):
    """The count is the only hint on the canvas that a review is pending."""
    asset = make_asset(db, board)
    anchor = Node(
        id=new_id("nod"),
        board_id=board.id,
        kind=NodeKind.asset.value,
        title="paper.pdf",
        source_asset_id=asset.id,
    )
    db.add(anchor)
    db.commit()

    _write_extraction(
        db,
        asset,
        ExtractionResult(
            summary="Summary text",
            findings=[finding("One"), finding("Two")],
            constraints=[constraint("Three")],
        ),
        actor_id="usr_1",
    )

    assert anchor.body.startswith("3 proposed: 2 findings, 1 constraints")
    assert "Summary text" in anchor.body


# --------------------------------------------------------------------- layout


def test_promoted_nodes_split_into_columns_by_kind():
    positions = place_promoted_nodes(0, 0, ["finding", "constraint"], {})

    assert positions[0][0] != positions[1][0]


def test_a_second_batch_lands_below_the_first():
    first = place_promoted_nodes(0, 0, ["finding", "finding"], {})
    second = place_promoted_nodes(0, 0, ["finding"], {"finding": 2})

    assert second[0] not in first
    assert second[0][1] > first[-1][1]


def test_every_promoted_node_gets_its_own_spot():
    kinds = ["finding"] * 5 + ["constraint"] * 5
    positions = place_promoted_nodes(0, 0, kinds, {})

    assert len(set(positions)) == len(kinds)
