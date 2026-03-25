#!/usr/bin/env python3
"""
Atlassian CLI — Command-line tool for Jira and Confluence operations.

Usage:
  python3 src/atlassian_cli.py jira get PROJ-42
  python3 src/atlassian_cli.py jira create PROJ Story "User login" "As a user..."
  python3 src/atlassian_cli.py jira comment PROJ-42 "Implementation complete."
  python3 src/atlassian_cli.py jira transitions PROJ-42
  python3 src/atlassian_cli.py jira transition PROJ-42 31
  python3 src/atlassian_cli.py jira search "project = PROJ AND status = 'To Do'"
  python3 src/atlassian_cli.py jira boards PROJ
  python3 src/atlassian_cli.py jira create-sprint 1 "Sprint 1" "Sprint goal"
  python3 src/atlassian_cli.py jira move-to-sprint 42 PROJ-1 PROJ-2

  python3 src/atlassian_cli.py confluence get 123456
  python3 src/atlassian_cli.py confluence find "Page Title" [--parent 123456]
  python3 src/atlassian_cli.py confluence create "Page Title" body.html [--parent 123456]
  python3 src/atlassian_cli.py confluence create "Page Title" - [--parent 123456]  # reads stdin

Requires .env with: ATLASSIAN_SA_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_CLOUD_ID, ATLASSIAN_SITE_URL
"""

import sys
import os
import json

# Import atlassian_client from the same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlassian_client as ac  # noqa: E402


def cmd_jira_get(args):
    key = args[0]
    issue = ac.jira_get_issue(key)
    f = issue['fields']
    print(f"{issue['key']}: {f['summary']}")
    print(f"  Status: {f['status']['name']}")
    print(f"  Type:   {f['issuetype']['name']}")
    if f.get('assignee'):
        print(f"  Assignee: {f['assignee']['displayName']}")
    if f.get('labels'):
        print(f"  Labels: {', '.join(f['labels'])}")


def cmd_jira_comment(args):
    key = args[0]
    text = args[1]
    adf_content = [
        {'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]}
    ]
    comment_id = ac.jira_add_comment(key, adf_content)
    print(f"Comment added to {key} (id: {comment_id})")


def cmd_jira_transitions(args):
    key = args[0]
    transitions = ac.jira_get_transitions(key)
    for t in transitions:
        print(f"  ID: {t['id']:>3} -> {t['name']} (to: {t['to']})")


def cmd_jira_transition(args):
    key, transition_id = args[0], args[1]
    ac.jira_transition(key, transition_id)
    print(f"Transitioned {key} (transition ID: {transition_id})")


def cmd_jira_search(args):
    jql = args[0]
    issues = ac.jira_search(jql)
    for issue in issues:
        f = issue['fields']
        print(f"  {issue['key']:>12}: {f['summary']} [{f['status']['name']}]")
    print(f"\n{len(issues)} issue(s) found")


def cmd_jira_create(args):
    # jira create <PROJECT> <TYPE> "<summary>" ["<description>"] [--epic KEY] [--labels l1,l2]
    project = args[0]
    issue_type = args[1]
    summary = args[2]
    description = args[3] if len(args) > 3 and not args[3].startswith('--') else None

    epic_key = None
    labels = None
    for i, a in enumerate(args):
        if a == '--epic' and i + 1 < len(args):
            epic_key = args[i + 1]
        if a == '--labels' and i + 1 < len(args):
            labels = args[i + 1].split(',')

    result = ac.jira_create_issue(project, issue_type, summary, description, epic_key, labels)
    print(f"Created: {result['key']}")
    print(f"  ID:  {result['id']}")
    print(f"  URL: {ac._site_url()}/browse/{result['key']}")


def cmd_jira_update(args):
    # jira update <KEY> <field>=<value> ...
    key = args[0]
    fields = {}
    for pair in args[1:]:
        if '=' in pair:
            k, v = pair.split('=', 1)
            fields[k] = v
    if not fields:
        print('Usage: jira update <KEY> summary="New title" description="New desc"')
        return
    ac.jira_update_issue(key, fields)
    print(f"Updated: {key}")


def cmd_jira_boards(args):
    project = args[0] if args else None
    boards = ac.jira_get_boards(project)
    for b in boards:
        print(f"  ID: {b['id']:>5}  Name: {b['name']}  Type: {b.get('type', '?')}")
    print(f"\n{len(boards)} board(s) found")


def cmd_jira_create_sprint(args):
    # jira create-sprint <BOARD_ID> "<name>" ["<goal>"] [--start DATE] [--end DATE]
    board_id = int(args[0])
    name = args[1]
    goal = args[2] if len(args) > 2 and not args[2].startswith('--') else None

    start_date = end_date = None
    for i, a in enumerate(args):
        if a == '--start' and i + 1 < len(args):
            start_date = args[i + 1]
        if a == '--end' and i + 1 < len(args):
            end_date = args[i + 1]

    result = ac.jira_create_sprint(board_id, name, goal, start_date, end_date)
    print(f"Created sprint: {result.get('name', name)}")
    print(f"  ID:    {result['id']}")
    print(f"  State: {result.get('state', '?')}")


def cmd_jira_move_to_sprint(args):
    # jira move-to-sprint <SPRINT_ID> <KEY1> <KEY2> ...
    sprint_id = int(args[0])
    issue_keys = args[1:]
    if not issue_keys:
        print('Usage: jira move-to-sprint <SPRINT_ID> <KEY1> [KEY2 ...]')
        return
    ac.jira_move_to_sprint(sprint_id, issue_keys)
    print(f"Moved {len(issue_keys)} issue(s) to sprint {sprint_id}")


def cmd_confluence_get(args):
    page_id = args[0]
    page = ac.confluence_get_page(page_id)
    print(f"Title: {page['title']}")
    print(f"ID:    {page['id']}")
    print(f"Space: {page.get('space', {}).get('key', '?')}")
    print(f"Version: {page.get('version', {}).get('number', '?')}")


def cmd_confluence_find(args):
    title = args[0]
    parent_id = None
    if '--parent' in args:
        parent_id = args[args.index('--parent') + 1]
    page_id, version = ac.confluence_find_page(title, parent_id)
    if page_id:
        print(f"Found: {title} (id: {page_id}, version: {version})")
    else:
        print(f"Not found: {title}")


def cmd_confluence_create(args):
    title = args[0]
    body_source = args[1]

    parent_id = None
    if '--parent' in args:
        parent_id = args[args.index('--parent') + 1]

    if body_source == '-':
        body_xhtml = sys.stdin.read()
    else:
        with open(body_source) as f:
            body_xhtml = f.read()

    page_id, page_url, action = ac.confluence_create_or_update_page(title, body_xhtml, parent_id)
    print(f"{action.title()}: {title}")
    print(f"  ID:  {page_id}")
    print(f"  URL: {page_url}")


COMMANDS = {
    'jira': {
        'get':              (cmd_jira_get, 1, 'jira get <KEY>'),
        'create':           (cmd_jira_create, 3, 'jira create <PROJECT> <TYPE> "<summary>" ["desc"] [--epic KEY] [--labels l1,l2]'),
        'update':           (cmd_jira_update, 2, 'jira update <KEY> field=value ...'),
        'comment':          (cmd_jira_comment, 2, 'jira comment <KEY> "<text>"'),
        'transitions':      (cmd_jira_transitions, 1, 'jira transitions <KEY>'),
        'transition':       (cmd_jira_transition, 2, 'jira transition <KEY> <ID>'),
        'search':           (cmd_jira_search, 1, 'jira search "<JQL>"'),
        'boards':           (cmd_jira_boards, 0, 'jira boards [PROJECT_KEY]'),
        'create-sprint':    (cmd_jira_create_sprint, 2, 'jira create-sprint <BOARD_ID> "<name>" ["goal"] [--start DATE] [--end DATE]'),
        'move-to-sprint':   (cmd_jira_move_to_sprint, 2, 'jira move-to-sprint <SPRINT_ID> <KEY1> [KEY2 ...]'),
    },
    'confluence': {
        'get':    (cmd_confluence_get, 1, 'confluence get <PAGE_ID>'),
        'find':   (cmd_confluence_find, 1, 'confluence find "<title>" [--parent ID]'),
        'create': (cmd_confluence_create, 2, 'confluence create "<title>" <body.html|-> [--parent ID]'),
    },
}


def main():
    if len(sys.argv) < 3:
        print('Usage: atlassian_cli.py <service> <command> [args...]')
        print()
        for service, cmds in COMMANDS.items():
            for name, (_, _, usage) in cmds.items():
                print(f'  {usage}')
        sys.exit(1)

    service = sys.argv[1]
    command = sys.argv[2]
    args = sys.argv[3:]

    if service not in COMMANDS:
        print(f'Unknown service: {service}. Use: {", ".join(COMMANDS.keys())}')
        sys.exit(1)

    if command not in COMMANDS[service]:
        print(f'Unknown command: {service} {command}. Use: {", ".join(COMMANDS[service].keys())}')
        sys.exit(1)

    func, min_args, usage = COMMANDS[service][command]

    # Filter out --parent and its value from positional arg count
    positional = [a for i, a in enumerate(args) if a != '--parent' and (i == 0 or args[i-1] != '--parent')]
    if len(positional) < min_args:
        print(f'Usage: {usage}')
        sys.exit(1)

    try:
        func(args)
    except ac.AtlassianAPIError as e:
        print(f'API Error: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
