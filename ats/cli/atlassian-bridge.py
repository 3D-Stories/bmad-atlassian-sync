#!/usr/bin/env python3
"""
Bridge script: accepts a JSON command on stdin, executes it via atlassian_client,
and returns the JSON result on stdout.

Used by the TypeScript clients to shell out to the Python Atlassian client
instead of reimplementing authentication and API routing in TypeScript.
"""

import sys
import json
import os

# Allow override of the scripts path via ATLASSIAN_SCRIPTS_PATH env var
SCRIPTS_PATH = os.environ.get(
    'ATLASSIAN_SCRIPTS_PATH',
    '/home/candrosoff/claude/scripts'
)
sys.path.insert(0, SCRIPTS_PATH)

import atlassian_client as ac  # noqa: E402


def handle(cmd: dict) -> object:
    action = cmd['action']

    if action == 'jira_get_issue':
        return ac.jira_get_issue(cmd['key'])

    elif action == 'jira_transitions':
        return ac.jira_get_transitions(cmd['key'])

    elif action == 'jira_transition':
        ac.jira_transition(cmd['key'], cmd['transition_id'])
        return {'success': True}

    elif action == 'jira_add_comment':
        cid = ac.jira_add_comment(cmd['key'], cmd['adf_content'])
        return {'comment_id': cid}

    elif action == 'jira_search':
        issues = ac.jira_search(cmd['jql'], cmd.get('fields'), cmd.get('max_results', 50))
        return {'issues': issues}

    elif action == 'jira_get_project':
        return ac.jira_api('GET', f"/project/{cmd['project_key']}")

    elif action == 'jira_create_issue':
        return ac.jira_create_issue(
            cmd['project_key'], cmd['issue_type'], cmd['summary'],
            cmd.get('description'), cmd.get('epic_key'), cmd.get('labels')
        )

    elif action == 'jira_update_issue':
        ac.jira_update_issue(cmd['key'], cmd['fields'])
        return {'success': True}

    elif action == 'jira_get_boards':
        return {'boards': ac.jira_get_boards(cmd.get('project_key'))}

    elif action == 'jira_create_sprint':
        return ac.jira_create_sprint(
            cmd['board_id'], cmd['name'],
            cmd.get('goal'), cmd.get('start_date'), cmd.get('end_date')
        )

    elif action == 'jira_move_to_sprint':
        ac.jira_move_to_sprint(cmd['sprint_id'], cmd['issue_keys'])
        return {'success': True}

    elif action == 'confluence_get_page':
        expand = cmd.get('expand', 'space,title,version,body.storage')
        return ac.confluence_v1_api('GET', f"/content/{cmd['page_id']}?expand={expand}")

    elif action == 'confluence_find_page':
        if 'space_key' in cmd:
            ac.CONFLUENCE_SPACE_KEY = cmd['space_key']
        pid, ver = ac.confluence_find_page(cmd['title'], cmd.get('parent_id'))
        return {'page_id': pid, 'version': ver}

    elif action == 'confluence_create_page':
        if 'space_key' in cmd:
            ac.CONFLUENCE_SPACE_KEY = cmd['space_key']
        page_id, page_url = ac.confluence_create_page(
            cmd['title'], cmd['body_xhtml'], cmd.get('parent_id')
        )
        return {'page_id': page_id, 'page_url': page_url}

    elif action == 'confluence_update_page':
        if 'space_key' in cmd:
            ac.CONFLUENCE_SPACE_KEY = cmd['space_key']
        page_id, page_url = ac.confluence_update_page(
            cmd['page_id'], cmd['title'], cmd['body_xhtml'], cmd['version']
        )
        return {'page_id': page_id, 'page_url': page_url}

    elif action == 'confluence_create_or_update':
        if 'space_key' in cmd:
            ac.CONFLUENCE_SPACE_KEY = cmd['space_key']
        pid, url, act = ac.confluence_create_or_update_page(
            cmd['title'], cmd['body_xhtml'], cmd.get('parent_id')
        )
        return {'page_id': pid, 'page_url': url, 'action': act}

    elif action == 'confluence_search':
        cql = cmd['cql']
        limit = cmd.get('limit', 25)
        import urllib.parse
        params = urllib.parse.urlencode({'cql': cql, 'limit': limit})
        return ac.confluence_v1_api('GET', f'/search?{params}')

    else:
        raise ValueError(f'Unknown action: {action}')


def main():
    try:
        raw = sys.stdin.read()
        cmd = json.loads(raw)
        result = handle(cmd)
        print(json.dumps(result))
    except Exception as e:
        # Write error JSON to stderr so the TS side can read it from the exception message
        error_payload = {'error': str(e), 'type': type(e).__name__}
        print(json.dumps(error_payload), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
