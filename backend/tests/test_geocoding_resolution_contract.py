from backend.services.geocoding import nominatim


def test_geocoding_details_expose_structured_address_suggestions(monkeypatch):
    monkeypatch.setattr(
        nominatim,
        "_geocode_address_with_details",
        lambda *_args, **_kwargs: (
            33.54789,
            -7.59582,
            True,
            "Résidence Yahya, Casablanca, Morocco",
            1,
            1,
            {
                "display_name": "Rue de Boukraa, Bourgogne, Casablanca, Maroc",
                "class": "highway",
                "type": "residential",
                "addresstype": "road",
                "address": {
                    "road": "Rue de Boukraa",
                    "suburb": "Bourgogne",
                    "city": "Casablanca",
                    "postcode": "20000",
                    "country_code": "ma",
                },
            },
        ),
    )

    result = nominatim.geocode_address_details(
        "Résidence Yahya, 739 Rue de Boukraa, Casablanca 20000"
    )

    assert result == {
        "resolved": True,
        "latitude": 33.54789,
        "longitude": -7.59582,
        "city": "Casablanca",
        "postal_code": "20000",
        "district": "Bourgogne",
        "precision": "street",
        "display_name": "Rue de Boukraa, Bourgogne, Casablanca, Maroc",
        "source": "nominatim",
        "city_source": "nominatim:city",
        "postal_code_source": "nominatim:postcode",
        "district_source": "nominatim:suburb",
    }


def test_geocoding_details_keep_unknown_values_null(monkeypatch):
    monkeypatch.setattr(
        nominatim,
        "_geocode_address_with_details",
        lambda *_args, **_kwargs: (None, None, False, None, 1, 1, None),
    )

    result = nominatim.geocode_address_details("Adresse introuvable")

    assert result["resolved"] is False
    assert result["latitude"] is None
    assert result["longitude"] is None
    assert result["city"] is None
    assert result["postal_code"] is None
    assert result["district"] is None
    assert result["source"] is None
