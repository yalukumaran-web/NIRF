import sys, os
import requests

requests.packages.urllib3.disable_warnings()

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def main():
    if len(sys.argv) < 3:
        print("USAGE: dl_pdf.py <url> <outpath>")
        sys.exit(3)
    url = sys.argv[1]
    out = sys.argv[2]
    try:
        try:
            r = requests.get(url, headers=HEADERS, timeout=90, allow_redirects=True)
        except requests.exceptions.SSLError:
            r = requests.get(url, headers=HEADERS, timeout=90, allow_redirects=True, verify=False)
        r.raise_for_status()
        data = r.content
        head = data[:2048]
        idx = head.find(b"%PDF-")
        if idx == -1:
            print("FAIL NOT_PDF %s %s %s" % (r.status_code, url, head[:120]))
            sys.exit(2)
        if idx > 0:
            data = data[idx:]
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        print("OK %d %s" % (len(data), out))
    except Exception as e:
        print("FAIL EXC %s %s" % (url, e))
        sys.exit(2)


if __name__ == "__main__":
    main()