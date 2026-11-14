"""Run: python -m unittest test_security.py"""
import os
import unittest

import security


def fake_resolver(mapping):
    def resolve(host, port):
        if host not in mapping:
            raise OSError("no such host")
        return [(None, None, None, None, (ip, port)) for ip in mapping[host]]
    return resolve


class UrlSafety(unittest.TestCase):
    def test_public_host_allowed(self):
        r = fake_resolver({"iea.org": ["93.184.216.34"]})
        self.assertTrue(security.is_public_http_url("https://iea.org/report.pdf", r))

    def test_internal_targets_blocked(self):
        r = fake_resolver({
            "meta": ["169.254.169.254"], "local": ["127.0.0.1"], "lan": ["10.0.0.5"],
            "mixed": ["93.184.216.34", "192.168.1.1"], "v6": ["::1"],
        })
        for host in ("meta", "local", "lan", "mixed", "v6"):
            self.assertFalse(security.is_public_http_url(f"http://{host}/x", r), host)

    def test_bad_scheme_credentials_unresolvable(self):
        r = fake_resolver({"iea.org": ["93.184.216.34"]})
        self.assertFalse(security.is_public_http_url("file:///etc/passwd", r))
        self.assertFalse(security.is_public_http_url("https://user:pw@iea.org/x", r))
        self.assertFalse(security.is_public_http_url("https://nope.invalid/x", r))


class Auth(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("QUANT_SERVICE_TOKEN", None)

    def test_open_when_no_token(self):
        self.assertTrue(security.is_authorized(None))

    def test_token_required_and_checked(self):
        os.environ["QUANT_SERVICE_TOKEN"] = "s3cret"
        self.assertFalse(security.is_authorized(None))
        self.assertFalse(security.is_authorized("Bearer wrong"))
        self.assertTrue(security.is_authorized("Bearer s3cret"))


if __name__ == "__main__":
    unittest.main()
