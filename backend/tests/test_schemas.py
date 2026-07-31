"""Schema validation at the API boundary — every field a router will read."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import EdgeCreate, EdgeUpdate, NodeCreate, NodeUpdate


def test_node_create_defaults():
    payload = NodeCreate(kind="finding", title="A finding")
    assert payload.body == ""
    assert payload.x == 0.0
    assert payload.y == 0.0


def test_node_create_rejects_empty_title():
    with pytest.raises(ValidationError):
        NodeCreate(kind="finding", title="")


def test_node_create_title_max_length():
    NodeCreate(kind="finding", title="x" * 400)  # ok
    with pytest.raises(ValidationError):
        NodeCreate(kind="finding", title="x" * 401)


def test_node_update_all_optional():
    payload = NodeUpdate()
    assert payload.title is None
    assert payload.body is None
    assert payload.task_status is None


def test_node_update_partial():
    payload = NodeUpdate(title="New title")
    assert payload.title == "New title"
    assert payload.body is None


def test_node_update_title_max():
    with pytest.raises(ValidationError):
        NodeUpdate(title="x" * 401)


def test_edge_create_defaults():
    payload = EdgeCreate(source_id="nod_a", target_id="nod_b")
    assert payload.relation.value == "supports"


def test_edge_create_explicit_relation():
    payload = EdgeCreate(source_id="nod_a", target_id="nod_b", relation="constrains")
    assert payload.relation.value == "constrains"


def test_edge_create_accepts_any_string_ids():
    """source_id/target_id are plain strs — validation at the DB layer."""
    payload = EdgeCreate(source_id="", target_id="nod_b")
    assert payload.source_id == ""


def test_edge_create_fields():
    payload = EdgeCreate(source_id="nod_a", target_id="nod_b", relation="derived_from")
    assert payload.source_id == "nod_a"
    assert payload.target_id == "nod_b"
    assert payload.relation.value == "derived_from"


def test_edge_update_valid():
    payload = EdgeUpdate(relation="derived_from")
    assert payload.relation.value == "derived_from"


def test_edge_update_rejects_invalid_relation():
    with pytest.raises(ValidationError):
        EdgeUpdate(relation="not_a_real_relation")


def test_edge_update_relation_required():
    with pytest.raises(ValidationError):
        EdgeUpdate()  # type: ignore[call-arg]
