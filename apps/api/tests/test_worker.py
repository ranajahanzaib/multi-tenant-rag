from multi_tenant_rag.worker import chunks


def test_chunking_preserves_offsets_and_page_boundaries() -> None:
    result = chunks([(1, "first paragraph."), (None, "second paragraph.")], size=10)
    assert result[0][0] == 1
    assert result[-1][0] is None
    assert all(start < end for _, start, end, _ in result)
    assert (
        "".join(chunk for _, _, _, chunk in result).replace(" ", "")
        == "firstparagraph.secondparagraph."
    )


def test_empty_pdf_extraction_is_not_reported_as_indexed() -> None:
    assert chunks([(1, ""), (None, "   ")]) == []
