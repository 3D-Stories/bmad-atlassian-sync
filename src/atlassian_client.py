#!/usr/bin/env python3
"""
Atlassian API Client — Pure-Python module for Jira and Confluence operations.

Handles authentication (Basic auth via Cloud API), env loading, and provides
simple functions for common operations. Used by atlassian-bridge.py (JSON
stdin/stdout bridge for the TypeScript layer) and can be used standalone.

Auth: Basic auth with service account email + API token via Cloud API.
- Jira v3:        https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/...
- Confluence v1:  https://api.atlassian.com/ex/confluence/{cloud_id}/wiki/rest/api/...
- Confluence v2:  https://api.atlassian.com/ex/confluence/{cloud_id}/wiki/api/v2/...

NOTE: Confluence v2 API rejects POST/PUT with our token scopes. Use v1 for writes.
NOTE: curl fails for POST/PUT due to header encoding with long auth strings. Always use urllib.
"""

import base64
import json
import os
import urllib.parse
import urllib.request

# ─────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────

# .env resolution order:
#   1. ATLASSIAN_ENV_PATH env var (explicit override)
#   2. .env in current working directory (project root when run via CLI/bridge)
#   3. .env one level up from this file (repo root when src/ is the script dir)
#   4. .env two levels up from this file (package root when bundled)
_this_dir = os.path.dirname(os.path.abspath(__file__))
_candidates = [
    os.environ.get('ATLASSIAN_ENV_PATH', ''),
    os.path.join(os.getcwd(), '.env'),
    os.path.join(_this_dir, '..', '.env'),
    os.path.join(_this_dir, '..', '..', '.env'),
]
ENV_PATH = next((p for p in _candidates if p and os.path.isfile(p)), '')

CONFLUENCE_SPACE_KEY = os.environ.get('CONFLUENCE_SPACE_KEY', '')
CONFLUENCE_SPACE_ID = os.environ.get('CONFLUENCE_SPACE_ID', '')
CONFLUENCE_ROOT_PAGE_ID = os.environ.get('CONFLUENCE_ROOT_PAGE_ID', '')

JIRA_PROJECT = os.environ.get('JIRA_PROJECT_KEY', '')

# ─────────────────────────────────────────────────────────────────────
# Env loading
# ─────────────────────────────────────────────────────────────────────

_env_cache = None


def load_env(path=None):
    """Load credentials from .env file. Returns dict of key=value pairs."""
    env_path = path or ENV_PATH
    env = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k] = v
    return env


def _get_env():
    global _env_cache
    if _env_cache is None:
        _env_cache = load_env()
    return _env_cache


def _auth_header():
    env = _get_env()
    auth = base64.b64encode(
        f"{env['ATLASSIAN_SA_EMAIL']}:{env['ATLASSIAN_API_TOKEN']}".encode()
    ).decode()
    return f'Basic {auth}'


def _cloud_id():
    return _get_env()['ATLASSIAN_CLOUD_ID']


def _site_url():
    return _get_env().get('ATLASSIAN_SITE_URL', '')


# ─────────────────────────────────────────────────────────────────────
# Low-level API callers
# ─────────────────────────────────────────────────────────────────────

def _request(url, method='GET', body=None):
    """Make an authenticated API request. Returns parsed JSON or {} for empty responses."""
    headers = {
        'Authorization': _auth_header(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_data = resp.read()
            return json.loads(resp_data) if resp_data else {}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ''
        raise AtlassianAPIError(e.code, e.reason, url, error_body) from e


class AtlassianAPIError(Exception):
    def __init__(self, status, reason, url, body):
        self.status = status
        self.reason = reason
        self.url = url
        self.body = body
        super().__init__(f'HTTP {status} {reason}: {url}\n{body[:500]}')


def jira_api(method, path, body=None):
    """Jira v3 REST API. Path should start with /, e.g. /issue/PROJ-42."""
    url = f'https://api.atlassian.com/ex/jira/{_cloud_id()}/rest/api/3{path}'
    return _request(url, method, body)


def confluence_v1_api(method, path, body=None):
    """Confluence v1 REST API (works for both reads and writes)."""
    url = f'https://api.atlassian.com/ex/confluence/{_cloud_id()}/wiki/rest/api{path}'
    return _request(url, method, body)


def confluence_v2_api(method, path, body=None):
    """Confluence v2 API (reads only — POST/PUT fail with current token scopes)."""
    url = f'https://api.atlassian.com/ex/confluence/{_cloud_id()}/wiki/api/v2{path}'
    return _request(url, method, body)


# ─────────────────────────────────────────────────────────────────────
# Jira operations
# ─────────────────────────────────────────────────────────────────────

def jira_get_issue(key):
    """Get a Jira issue. Returns full issue JSON."""
    return jira_api('GET', f'/issue/{key}')


def jira_add_comment(key, adf_content):
    """Add a comment to a Jira issue using ADF (Atlassian Document Format).

    adf_content: the 'content' array of ADF nodes. Example:
        [
            {"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}
        ]
    Returns comment ID.
    """
    body = {
        'body': {
            'version': 1,
            'type': 'doc',
            'content': adf_content,
        }
    }
    result = jira_api('POST', f'/issue/{key}/comment', body)
    return result.get('id')


def jira_get_transitions(key):
    """Get available status transitions for a Jira issue. Returns list of {id, name, to}."""
    result = jira_api('GET', f'/issue/{key}/transitions')
    return [
        {'id': t['id'], 'name': t['name'], 'to': t['to']['name']}
        for t in result['transitions']
    ]


def jira_transition(key, transition_id):
    """Transition a Jira issue to a new status. Returns True on success."""
    jira_api('POST', f'/issue/{key}/transitions', {'transition': {'id': str(transition_id)}})
    return True


def jira_search(jql, fields=None, max_results=50):
    """Search Jira issues with JQL. Returns list of issues.

    Uses the new /search/jql endpoint (the old /search was removed 2025).
    """
    body = {
        'jql': jql,
        'maxResults': max_results,
        'fields': fields if fields else ['key', 'summary', 'status'],
    }
    result = jira_api('POST', '/search/jql', body)
    return result.get('issues', [])


def jira_create_issue(project_key, issue_type, summary, description_text=None,
                      epic_key=None, labels=None, priority=None):
    """Create a Jira issue. Returns {id, key, self}.

    issue_type: 'Epic', 'Story', 'Task', 'Bug'
    description_text: plain text (converted to ADF automatically)
    epic_key: parent epic key (e.g. 'PROJ-10') for stories
    labels: list of label strings
    """
    fields = {
        'project': {'key': project_key},
        'issuetype': {'name': issue_type},
        'summary': summary,
    }

    if description_text:
        fields['description'] = {
            'version': 1,
            'type': 'doc',
            'content': [
                {'type': 'paragraph', 'content': [{'type': 'text', 'text': description_text}]}
            ],
        }

    if labels:
        fields['labels'] = labels

    if priority:
        fields['priority'] = {'name': priority}

    if epic_key:
        # Epic link field varies by instance — discover it
        try:
            all_fields = jira_api('GET', '/field')
            epic_field = next((f['id'] for f in all_fields if f['name'] == 'Epic Link'), None)
            if epic_field:
                fields[epic_field] = epic_key
        except Exception:
            pass  # Skip epic link if discovery fails

    return jira_api('POST', '/issue', {'fields': fields})


def jira_update_issue(key, fields):
    """Update a Jira issue's fields. fields is a dict of field names to values.

    String descriptions are auto-converted to ADF.
    """
    if 'description' in fields and isinstance(fields['description'], str):
        fields['description'] = {
            'version': 1,
            'type': 'doc',
            'content': [
                {'type': 'paragraph', 'content': [{'type': 'text', 'text': fields['description']}]}
            ],
        }
    return jira_api('PUT', f'/issue/{key}', {'fields': fields})


def jira_get_project(project_key):
    """Get project details including issue types."""
    return jira_api('GET', f'/project/{project_key}')


# ─────────────────────────────────────────────────────────────────────
# Jira Agile / Sprint operations
# ─────────────────────────────────────────────────────────────────────

def jira_agile_api(method, path, body=None):
    """Jira Agile REST API. Path should start with /, e.g. /sprint."""
    url = f'https://api.atlassian.com/ex/jira/{_cloud_id()}/rest/agile/1.0{path}'
    return _request(url, method, body)


def jira_get_boards(project_key=None):
    """List Jira boards. Optionally filter by project key."""
    params = f'?projectKeyOrId={project_key}' if project_key else ''
    result = jira_agile_api('GET', f'/board{params}')
    return result.get('values', [])


def jira_create_sprint(board_id, name, goal=None, start_date=None, end_date=None):
    """Create a new sprint on a board. Returns sprint object {id, self, state, name}."""
    body = {
        'name': name,
        'originBoardId': board_id,
    }
    if goal:
        body['goal'] = goal
    if start_date:
        body['startDate'] = start_date
    if end_date:
        body['endDate'] = end_date
    return jira_agile_api('POST', '/sprint', body)


def jira_move_to_sprint(sprint_id, issue_keys):
    """Move issues into a sprint. issue_keys is a list of keys like ['PROJ-1', 'PROJ-2']."""
    return jira_agile_api('POST', f'/sprint/{sprint_id}/issue', {'issues': issue_keys})


# ─────────────────────────────────────────────────────────────────────
# Confluence operations
# ─────────────────────────────────────────────────────────────────────

def confluence_get_page(page_id, expand='space,title,version'):
    """Get a Confluence page by ID."""
    return confluence_v1_api('GET', f'/content/{page_id}?expand={expand}')


def confluence_find_page(title, parent_id=None):
    """Find a Confluence page by title in DC space. Returns (page_id, version) or (None, None)."""
    encoded = urllib.parse.quote(title)
    path = f'/content?title={encoded}&spaceKey={CONFLUENCE_SPACE_KEY}&expand=version,ancestors&limit=25'
    result = confluence_v1_api('GET', path)
    for page in result.get('results', []):
        if page.get('title') == title:
            if parent_id:
                ancestor_ids = [str(a.get('id', '')) for a in page.get('ancestors', [])]
                if str(parent_id) not in ancestor_ids:
                    continue
            version = page.get('version', {}).get('number', 1)
            return page['id'], version
    return None, None


def confluence_create_page(title, body_xhtml, parent_id=None):
    """Create a new Confluence page. Returns (page_id, page_url).

    body_xhtml: Confluence storage format (XHTML with ac:structured-macro, etc.)
    parent_id: ancestor page ID (defaults to DC homepage 203325745)
    """
    pid = str(parent_id or CONFLUENCE_ROOT_PAGE_ID)
    payload = {
        'type': 'page',
        'title': title,
        'ancestors': [{'id': pid}],
        'space': {'key': CONFLUENCE_SPACE_KEY},
        'body': {
            'storage': {
                'value': body_xhtml,
                'representation': 'storage',
            },
        },
    }
    result = confluence_v1_api('POST', '/content', payload)
    page_id = result['id']
    page_url = f'{_site_url()}/wiki{result["_links"]["webui"]}'
    return page_id, page_url


def confluence_update_page(page_id, title, body_xhtml, version):
    """Update an existing Confluence page. Returns (page_id, page_url).

    version: current version number (will be incremented).
    """
    payload = {
        'id': str(page_id),
        'type': 'page',
        'title': title,
        'space': {'key': CONFLUENCE_SPACE_KEY},
        'body': {
            'storage': {
                'value': body_xhtml,
                'representation': 'storage',
            },
        },
        'version': {
            'number': version + 1,
        },
    }
    result = confluence_v1_api('PUT', f'/content/{page_id}', payload)
    page_url = f'{_site_url()}/wiki{result["_links"]["webui"]}'
    return result['id'], page_url


def confluence_create_or_update_page(title, body_xhtml, parent_id=None):
    """Idempotent: create page if it doesn't exist, update if it does.

    Returns (page_id, page_url, 'created'|'updated').
    """
    pid = parent_id or CONFLUENCE_ROOT_PAGE_ID
    existing_id, version = confluence_find_page(title, pid)
    if existing_id:
        page_id, page_url = confluence_update_page(existing_id, title, body_xhtml, version)
        return page_id, page_url, 'updated'
    page_id, page_url = confluence_create_page(title, body_xhtml, pid)
    return page_id, page_url, 'created'
