# Validation

Verified on Python 3.12 on 24 October 2026.

- `python -m pytest -q --tb=short`: **41 passed**. One dependency deprecation warning from
  Starlette's HTTPX test adapter; no failing tests.
- `python -m ruff check app tests scripts`: **passed**.
- `python -m scripts.demo`: **passed**; private simulated inbox only.
- `python -m pip check`: **no broken requirements**.
- A separate real Uvicorn process was exercised over localhost HTTP: account registration,
  login, consent, trip activation, server termination/restart with the same database,
  automatic overdue dispatch, returned check-in, follow-up dispatch, and readiness passed.

The SMTP adapter was tested with a mocked SMTP object. No real recipient was emailed.
Real provider integration, deliverability, live GPS-free positioning, and Docker execution
were not tested. Docker was not installed in the development environment.

These checks establish the prototype's implemented behaviors; they do not establish
operational reliability for emergency use. See README limitations and next steps.

