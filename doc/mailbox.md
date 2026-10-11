# 📬 Mailbox

Applying for a flat happens by email, and so do the answers: an acknowledgement, a request for
documents, an invitation to a viewing, a rejection. Fredy can read those answers from your own
mailbox, so they sit next to the listings they belong to instead of somewhere in your inbox.

Nothing changes until you connect a mailbox. Without one, Fredy does not schedule anything, does
not create a key file and does not open a single connection.

## Connecting a mailbox

**Settings → Mailbox**. Every user connects their own; nobody else, admins included, can read it.

| Field | |
|---|---|
| Server, port | Any public IMAP server. Port **993** is IMAP over TLS, port **143** must offer STARTTLS, and the upgrade is mandatory: Fredy never sends a password in plain text. |
| Username, password | Your login. Many providers (Gmail, iCloud, Outlook, GMX with two-factor login) want an *app password* here rather than your normal one. |
| Folder | `INBOX` by default. Fredy downloads **every** message in this folder, so a separate address or a folder your mail filters sort applications into is the better choice. |
| Keep mail for | 30, 90 (default), 180 or 365 days. Older messages are deleted from Fredy, never from the server. |

**Test connection** logs in and opens the folder without downloading anything. The **Inbox** entry
in the sidebar then shows what arrived; **Fetch now** downloads new mail immediately instead of
waiting for the next run.

## What Fredy does with your mail

- Every ten minutes, while at least one mailbox is connected, Fredy asks the server for messages it
  has not seen yet. The first run looks back 30 days. Messages are fetched with `BODY.PEEK` from a
  folder opened read-only, so nothing is marked as read or changed on the server.
- Only text is kept. HTML-only mail is converted to text on download and the markup is thrown away,
  so nothing a stranger wrote into an email can ever run in Fredy's interface, load a tracking pixel
  or restyle the page. Messages over 1 MB keep only their envelope (sender, subject, date).
- Sender, subject and body are stored encrypted, together with the password (see below). Only the
  headers needed to sort and thread messages - date, Message-ID, In-Reply-To, References - are
  readable in the database.
- **Downloaded mail → Delete downloaded mail** removes everything Fredy stored. Removing the mailbox
  removes the login and every message with it.

## Encryption and the key

The password and the message contents are sealed with AES-256-GCM. The key never lives in the
database, which is the point: the backup you download, or a `listings.db` you copy to another
machine, contains the sealed values but not the means to open them.

Fredy takes the key from, in this order:

1. The environment variable `FREDY_ENCRYPTION_KEY`: 32 bytes, as 64 hexadecimal characters or
   base64 (`openssl rand -hex 32`).
2. `conf/secret.key`, which Fredy writes with a random key (mode 0600) the first time something is
   encrypted. In Docker that is the `/conf` volume, so keep it alongside `/db`.

Lose the key and the stored password and messages cannot be read any more. Fredy says so instead of
failing: the mailbox page asks for the password again, and old messages show as unreadable until
they age out or are deleted.

## Network safety

A mailbox server is something any signed-in user can type in, and Fredy then connects to it from
inside your network. So only ports 993 and 143 are accepted, and the server name must resolve to
public addresses only - checked against the address actually dialled, not just once before
connecting. `localhost`, `*.local`, private ranges (10/8, 172.16/12, 192.168/16, 100.64/10),
link-local and the cloud metadata address are refused. A mail server on your own LAN is therefore
not supported. Connection errors are reduced to a few fixed messages, so they never reveal internal
addresses.
