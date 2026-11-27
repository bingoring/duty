#!/bin/sh
# waypoint-hook-version: 2
# waypoint 보드 동기화. waypoint 플러그인의 scripts/board-sync.sh 사본이다(레포에는 .githooks/board-sync.sh).
# 이 파일을 직접 고치지 말고 플러그인의 것으로 바꾼다(둘째 줄의 버전이 낮으면 세션 시작 때 경고가 나온다).
#
# 사용: .githooks/board-sync.sh [--commit <sha>]
#   - STATUS(docs/waypoint/STATUS.md)를 읽어 CLAUDE.md의 「- 보드: <주소>」 Project들의 카드와 스테이지 이슈를 맞춘다.
#   - --commit이 없으면 기본 브랜치 끝 커밋을 쓴다. STATUS와 「보드:」 줄은 모두 그 커밋에서 읽는다.
#   - 보통은 .githooks/pre-push가 기본 브랜치로 STATUS를 push할 때 띄운다.
#   - 결과는 메인 체크아웃의 .git/waypoint/board-sync.status(ok|fail …)와 board-sync.log에 남는다.
# 설계: waypoint 레포 docs/superpowers/specs/2026-11-25-board-sync-design.md 5.5~5.9절.

# >>> waypoint status-check >>>
# wp_status_check <STATUS 파일> [<id 목록 파일>]
# 글자 수는 UTF-8 연속 바이트(0x80-0xBF)를 뺀 바이트 수로 센다. 로케일과 상관없이 한글 한 글자가 1이 된다.
wp_status_check() {
  _wp_out=$(LC_ALL=C awk -v ids="${2:-}" '
function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
function clen(s) { gsub(/[\200-\277]/, "", s); return length(s) }
function bad(ln, k, msg) {
  if (ln == "") print "STATUS.md: [검사 " k "] " msg
  else print "STATUS.md:" ln ": [검사 " k "] " msg
}
function starts(s, p) { return substr(s, 1, length(p)) == p }
BEGIN {
  HEADER = "| ID | 스테이지 | 상태 | 줄기 | 지금 | 기다림 | 링크 |"
  split("PENDING IN_PROGRESS AI_PROPOSED HUMAN_APPROVED MERGED DEFERRED", sv, " ")
  for (i in sv) okstate[sv[i]] = 1
  P1 = "계획: "; P2 = "구현: "; P3 = "계획 검토: "; P4 = "결과 검토: "
  ALLOWED = "STATUS에는 제목, 링크 한 줄, \"## 스테이지\" 표, \"## 오너 할 일\"의 \"- [ ] \" 줄만 둔다(지난 기록은 HISTORY.md, 하위 진행은 스테이지 문서의 \"진행 기록\")"
  full = (ids != "")
  nid = 0
  if (full) {
    while ((r = (getline l < ids)) > 0) {
      sub(/\r$/, "", l)
      if (l == "") continue
      t = index(l, "\t")
      if (t == 0) continue
      p = substr(l, 1, t - 1); v = substr(l, t + 1)
      docid[p] = v
      nid++; idpath[nid] = p
    }
    if (r < 0) { print "STATUS.md: [검사 6] id 목록 파일 " ids "을 읽을 수 없다."; exit 1 }
  }
  sec = "head"; heads = 0; tstate = ""; seen_stage = 0; nblock = 0
}
{
  line = $0
  sub(/\r$/, "", line)
  ln = NR
  if (NR == 1) {
    if (!starts(line, "# ")) bad(ln, 10, "첫 줄은 \"# <프로젝트> — waypoint 현황\" 같은 제목이어야 한다. " ALLOWED ".")
    next
  }
  if (starts(line, "## ")) {
    if (line == "## 스테이지") {
      if (seen_stage) bad(ln, 10, "\"## 스테이지\" 절이 두 번 있다. 표는 하나만 둔다.")
      sec = "stage"; seen_stage = 1; tstate = "header"
    } else if (line == "## 오너 할 일") {
      sec = "owner"
    } else {
      bad(ln, 10, "허용하지 않는 절이다. " ALLOWED ".")
      sec = "other"
    }
    next
  }
  if (sec == "other") next
  if (starts(line, "#")) { bad(ln, 10, "허용하지 않는 제목 줄이다. " ALLOWED "."); next }
  if (line ~ /^[ \t]*$/) {
    if (sec == "stage" && tstate == "rows") tstate = "done"
    next
  }
  if (sec == "head") {
    heads++
    if (heads > 1 || index(line, "](") == 0) bad(ln, 10, "제목과 \"## 스테이지\" 사이에는 링크 한 줄만 둔다. " ALLOWED ".")
    next
  }
  if (sec == "owner") {
    if (!starts(line, "- [ ] ")) { bad(ln, 10, "\"## 오너 할 일\"에는 \"- [ ] <할 일> (막음: <ID>)\" 줄만 둔다. 끝난 할 일은 체크하지 말고 줄을 지운다."); next }
    rest = line; sub(/[ \t]+$/, "", rest)
    if (match(rest, /\(막음: [^)]*\)$/)) {
      lst = substr(rest, RSTART + length("(막음: "), RLENGTH - length("(막음: ") - 1)
      m = split(lst, bi, ",")
      for (j = 1; j <= m; j++) { nblock++; bid[nblock] = trim(bi[j]); bln[nblock] = ln }
    }
    next
  }
  # sec == "stage"
  if (!starts(line, "|") || tstate == "done") {
    bad(ln, 10, "\"## 스테이지\" 아래에는 표 하나만 둔다. " ALLOWED ".")
    next
  }
  if (tstate == "header") {
    if (trim(line) != HEADER) bad(ln, 1, "표의 머리 줄이 정해진 형식과 다르다. \"" HEADER "\"로 쓴다.")
    tstate = "sep"; next
  }
  if (tstate == "sep") {
    s = trim(line); n = split(s, f, "|")
    if (s !~ /^[|: -]+$/ || n - 2 != 7) bad(ln, 1, "머리 줄 다음에는 구분 줄 \"|---|---|---|---|---|---|---|\"을 둔다.")
    tstate = "rows"; next
  }
  # 본문 줄
  s = trim(line)
  n = split(s, f, "|")
  if (substr(s, length(s), 1) == "|") nc = n - 2; else nc = n - 1
  if (nc != 7 || substr(s, length(s), 1) != "|") {
    bad(ln, 2, "칸이 " nc "개다. 줄은 \"|\"로 시작하고 끝나며 칸은 정확히 7개다. 셀 안에서는 \"|\"와 줄바꿈을 쓰지 않는다.")
    next
  }
  id = trim(f[2]); st = trim(f[4]); now = trim(f[6]); link = trim(f[8])
  if (id !~ /^[123R]-[0-9]+$/) bad(ln, 4, "ID \"" id "\"의 형식이 틀렸다. \"<단계>-<번호>\"(예: 1-1, 2-16, R-1)로 쓴다.")
  else if (id in rowln) bad(ln, 4, "ID \"" id "\"가 " rowln[id] "행과 겹친다. 한 ID는 한 줄에만 쓰고, 정한 ID는 바꾸거나 다시 쓰지 않는다.")
  if (!(id in rowln)) rowln[id] = ln
  if (!(st in okstate)) { bad(ln, 3, "상태 \"" st "\"는 쓸 수 없다. PENDING, IN_PROGRESS, AI_PROPOSED, HUMAN_APPROVED, MERGED, DEFERRED 가운데 하나를 쓴다."); next }
  if (clen(now) > 80) bad(ln, 5, "\"지금\"이 " clen(now) "자다. 80자 이하의 한 줄로 줄이고, 하위 진행은 스테이지 문서의 \"진행 기록\"에 쓴다.")
  if ((st == "PENDING" || st == "MERGED") && now != "") bad(ln, 5, st " 줄의 \"지금\"은 비워 둔다.")
  if (st == "IN_PROGRESS" && !starts(now, P1) && !starts(now, P2)) bad(ln, 5, "IN_PROGRESS 줄의 \"지금\"은 \"" P1 "\"(계획을 쓰는 중) 또는 \"" P2 "\"(계획 승인 뒤 구현 중)로 시작한다.")
  if (st == "AI_PROPOSED" && !starts(now, P3) && !starts(now, P4)) bad(ln, 5, "AI_PROPOSED 줄의 \"지금\"은 \"" P3 "\" 또는 \"" P4 "\"로 시작한다.")
  if (st == "DEFERRED" && !starts(now, P1) && !starts(now, P2) && !starts(now, P3) && !starts(now, P4)) bad(ln, 5, "DEFERRED 줄의 \"지금\"은 보류 전 상태의 머리말(\"" P1 "\", \"" P2 "\", \"" P3 "\", \"" P4 "\")로 시작하고 보류 이유나 재개 조건을 붙인다.")
  if ((st == "IN_PROGRESS" || st == "AI_PROPOSED" || st == "HUMAN_APPROVED") && link !~ /\[[^]]*\]\([^)]+\)/) bad(ln, 7, st " 줄의 링크 칸에 링크가 없다. PR 링크나 스테이지 문서 링크를 적는다.")
  if (full && st == "MERGED") {
    rel = 0; hit = 0; why = ""
    rest = link
    while (match(rest, /\]\([^)]+\)/)) {
      p = substr(rest, RSTART + 2, RLENGTH - 3)
      rest = substr(rest, RSTART + RLENGTH)
      if (p ~ /^[a-zA-Z]+:/ || starts(p, "#")) continue
      sub(/#.*$/, "", p); sub(/^\.\//, "", p)
      rel++
      if ((p in docid) && docid[p] == id) { hit = 1; break }
      if (why == "") {
        if (p in docid) why = "문서 \"" p "\"의 id가 \"" docid[p] "\"다. 줄의 ID(" id ")와 같아야 한다."
        else why = "문서 \"" p "\"가 커밋에 없거나 \"id:\" frontmatter가 없다. 머지된 스테이지 문서를 가리키고, 그 문서에 \"id: " id "\"를 둔다."
      }
    }
    if (rel == 0) bad(ln, 6, "MERGED 줄의 링크 칸에 스테이지 문서의 상대 경로 링크가 없다. [문서](<docs/waypoint 기준 경로>) 링크를 더한다.")
    else if (!hit) bad(ln, 6, why)
  }
}
END {
  if (!seen_stage) bad("", 1, "\"## 스테이지\" 절이 없다. 제목과 링크 줄 아래에 \"## 스테이지\"와 표를 둔다.")
  else if (tstate == "header") bad("", 1, "\"## 스테이지\" 아래에 표가 없다. 머리 줄 \"" HEADER "\"로 표를 시작한다.")
  for (j = 1; j <= nblock; j++)
    if (!(bid[j] in rowln)) bad(bln[j], 9, "\"(막음: …)\"의 ID \"" bid[j] "\"가 표에 없다. 표에 있는 ID를 쓴다.")
  if (full)
    for (j = 1; j <= nid; j++)
      if (!(docid[idpath[j]] in rowln))
        print "docs/waypoint/" idpath[j] ": [검사 8] \"id: " docid[idpath[j]] "\"인 스테이지 문서가 있지만 STATUS 표에 " docid[idpath[j]] " 줄이 없다. 표에 그 스테이지의 줄을 더한다."
}
' "$1")
  _wp_rc=$?
  if [ "$_wp_rc" -ne 0 ] || [ -n "$_wp_out" ]; then
    [ -n "$_wp_out" ] && printf '%s\n' "$_wp_out" >&2
    return 1
  fi
  return 0
}
# <<< waypoint status-check <<<

# wp_desired_cards <STATUS 파일>: 표의 줄마다 카드가 가져야 할 값을 JSON 한 줄로 출력한다.
#   {"id","title","state","status","stem","now","wait","phase","open"}
#   status는 보드 열 이름, open은 MERGED가 아니면 true, wait가 「오너 할 일」이면 그 ID를 막는 할 일들로 넓힌다.
wp_desired_cards() {
  LC_ALL=C awk '
function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
function js(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(/\t/, "\\t", s); return "\"" s "\"" }
BEGIN {
  m["PENDING"] = "대기"; m["IN_PROGRESS"] = "진행 중"; m["AI_PROPOSED"] = "검토 대기"
  m["HUMAN_APPROVED"] = "승인"; m["MERGED"] = "머지됨"; m["DEFERRED"] = "보류"
}
{ sub(/\r$/, "") }
/^## 스테이지$/ { sec = "stage"; t = 0; next }
/^## 오너 할 일$/ { sec = "owner"; next }
/^## / { sec = ""; next }
sec == "stage" && /^\|/ {
  t++
  if (t <= 2) next
  n = split($0, f, "|")
  id = trim(f[2]); nr++; ids[nr] = id
  name[id] = trim(f[3]); st[id] = trim(f[4]); stem[id] = trim(f[5]); now[id] = trim(f[6]); wt[id] = trim(f[7])
  next
}
sec == "owner" && /^- \[ \] / {
  txt = substr($0, 7)
  if (match(txt, /[ \t]*\(막음: [^)]*\)[ \t]*$/)) {
    lst = substr(txt, RSTART, RLENGTH); txt = trim(substr(txt, 1, RSTART - 1))
    sub(/^[ \t]*\(막음: /, "", lst); sub(/\)[ \t]*$/, "", lst)
    k = split(lst, b, ",")
    for (j = 1; j <= k; j++) {
      bid = trim(b[j])
      if (bid in tasks) tasks[bid] = tasks[bid] " · " txt; else tasks[bid] = txt
    }
  }
}
END {
  for (i = 1; i <= nr; i++) {
    id = ids[i]; s = st[id]; w = wt[id]
    if (w == "오너 할 일" && (id in tasks)) w = "오너 할 일: " tasks[id]
    ph = id; sub(/-.*/, "", ph)
    printf "{\"id\":%s,\"title\":%s,\"state\":%s,\"status\":%s,\"stem\":%s,\"now\":%s,\"wait\":%s,\"phase\":%s,\"open\":%s}\n", \
      js(id), js("[" id "] " name[id]), js(s), js(m[s]), js(stem[id]), js(now[id]), js(w), js(ph), (s == "MERGED" ? "false" : "true")
  }
}' "$1"
}

# wp_board_urls <CLAUDE.md>: 「- 보드:」 줄의 Project 주소를 한 줄에 하나씩 출력한다. 형식이 틀린 주소는 stderr에 경고하고 건너뛴다.
wp_board_urls() {
  awk '{ sub(/\r$/, "") } /^[ \t]*- 보드:/ { sub(/^[ \t]*- 보드:[ \t]*/, ""); n = split($0, a, /[ \t]+/); for (i = 1; i <= n; i++) if (a[i] != "") print a[i] }' "$1" |
    while IFS= read -r u; do
      if printf '%s\n' "$u" | grep -qE '^https://github\.com/(users|orgs)/[A-Za-z0-9._-]+/projects/[0-9]+/?$'; then
        printf '%s\n' "${u%/}"
      else
        echo "waypoint: 보드 주소 형식이 틀려 건너뛴다: $u" >&2
      fi
    done
}

# Project를 읽는 GraphQL. OWNERKIND는 user 또는 organization으로 바꾼다.
# 카드는 gh project item-list가 아니라 이 질의로 읽는다(item-list JSON은 한글 필드 이름의 키를 깨뜨린다).
WP_GQL_PROJECT='query($owner: String!, $number: Int!, $after: String) {
  OWNERKIND(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 50) { nodes { __typename ... on ProjectV2FieldCommon { id name dataType } ... on ProjectV2SingleSelectField { options { id name color description } } } }
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isArchived
          content { __typename ... on Issue { number title state url repository { nameWithOwner } } }
          fieldValues(first: 30) { nodes { __typename
            ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
            ... on ProjectV2ItemFieldSingleSelectValue { name optionId field { ... on ProjectV2FieldCommon { name } } } } }
        }
      }
    }
  }
}'

# 읽은 Project에서 카드 목록: [{item, number, title, state, url, v:{필드 이름: 값}}] (이 레포의 이슈이고 ID 값이 있는 카드만)
# jq --arg k <user|organization> --arg repo <owner/repo>. 한 Project에 여러 레포의 카드가 있어도(설계 5.12절) 이 레포 것만 본다.
WP_JQ_CARDS='.data[$k].projectV2.items.nodes
  | map(select(.content.__typename == "Issue"))
  | map(select((.content.repository.nameWithOwner // "" | ascii_downcase) == ($repo | ascii_downcase)))
  | map({item: .id, number: .content.number, title: .content.title, state: .content.state, url: .content.url,
         v: ([.fieldValues.nodes[] | select(.field.name != null) | {key: .field.name, value: (.text // .name)}] | from_entries)})
  | map(select((.v.ID // "") != ""))'

WP_BODY='이 이슈는 waypoint STATUS에서 만들어졌다. 상태는 STATUS가 정하고, 이 본문은 작업 세션이 세부 진행을 적는 곳이다.

## 체크리스트

## 최근 진행
'

wp_now() { date +%Y-%m-%dT%H:%M:%S%z; }
wp_log() { printf '%s %s\n' "$(wp_now)" "$*" >> "$WP_DIR/board-sync.log"; }
# wp_fail <단계> <이유>: 상태 파일에 실패를 적는다. 호출한 쪽이 return 1 한다.
wp_fail() {
  printf 'fail %s %s: %s\n' "$(wp_now)" "$1" "$2" > "$WP_DIR/board-sync.status"
  wp_log "실패 $1: $2"
  echo "waypoint 보드 동기화 실패($1): $2" >&2
}

wp_default_branch() {
  _d=$(git symbolic-ref -q --short refs/remotes/origin/HEAD) && { printf '%s\n' "${_d#origin/}"; return 0; }
  for _b in main master; do
    git show-ref -q --verify "refs/heads/$_b" && { printf '%s\n' "$_b"; return 0; }
  done
  return 1
}

# origin 원격 주소에서 owner/repo
wp_repo() {
  _u=$(git remote get-url origin 2>/dev/null) || return 1
  _u=${_u%.git}
  case $_u in
    https://github.com/*) _u=${_u#https://github.com/} ;;
    git@github*:*) _u=${_u#*:} ;;
    ssh://git@github*/*) _u=${_u#ssh://git@*/} ;;
    *) return 1 ;;
  esac
  case $_u in
    */*/* | /* | */ | '') return 1 ;;
    */*) printf '%s\n' "$_u" ;;
    *) return 1 ;;
  esac
}

# wp_read_project <user|organization> <소유자> <번호> <출력 파일>: 모든 페이지를 읽어 하나로 합친다.
wp_read_project() {
  _q=$(printf '%s' "$WP_GQL_PROJECT" | sed "s/OWNERKIND/$1/")
  _after=; _i=0
  while :; do
    _i=$((_i + 1))
    if [ -z "$_after" ]; then
      gh api graphql -F owner="$2" -F number="$3" -f query="$_q" > "$WP_TMP/page$_i.json" || return 1
    else
      gh api graphql -F owner="$2" -F number="$3" -f after="$_after" -f query="$_q" > "$WP_TMP/page$_i.json" || return 1
    fi
    jq -e --arg k "$1" '.data[$k].projectV2.id' "$WP_TMP/page$_i.json" > /dev/null 2>&1 || return 1
    if [ "$(jq -r --arg k "$1" '.data[$k].projectV2.items.pageInfo.hasNextPage' "$WP_TMP/page$_i.json")" = true ]; then
      _after=$(jq -r --arg k "$1" '.data[$k].projectV2.items.pageInfo.endCursor' "$WP_TMP/page$_i.json")
    else
      break
    fi
  done
  _j=1
  while [ "$_j" -le "$_i" ]; do cat "$WP_TMP/page$_j.json"; _j=$((_j + 1)); done |
    jq -s --arg k "$1" '.[0].data[$k].projectV2.items.nodes = [.[].data[$k].projectV2.items.nodes[]] | .[0]' > "$4" || return 1
  rm -f "$WP_TMP"/page*.json
}

# wp_missing_cards: 열린 줄(MERGED 아님) 가운데 cards.json에 카드가 없는 ID를 공백으로 이어 출력한다.
wp_missing_cards() {
  jq -r --slurpfile c "$WP_TMP/cards.json" '[.[] | select(.open) | select(.id as $i | $c[0] | map(.v.ID) | index($i) | not) | .id] | join(" ")' "$WP_TMP/desired.json"
}

# wp_missing_why <user|organization> <읽은 Project 파일> <ID 목록>: 다시 읽은 결과에서 ID마다 카드가 아예 없는지,
# 카드는 있는데 ID 값만 없는지 적는다. item-add가 돌려준 항목 id(added.tsv)로 찾는다(설계 10절의 읽기 지연 기록).
wp_missing_why() {
  jq -r --arg k "$1" --arg miss "$3" --rawfile a "$WP_TMP/added.tsv" '
    ([$a | split("\n")[] | select(. != "") | split("\t") | {key: .[0], value: .[1]}] | from_entries) as $add
    | [.data[$k].projectV2.items.nodes[].id] as $seen
    | [$miss | split(" ")[] | . as $i | $add[$i] as $it
       | $i + "(" + (if $it == null then "이번에 넣은 카드가 아님" elif ($seen | index($it)) == null then "카드 없음" else "카드는 있고 ID 값 없음" end) + ")"]
    | join(", ")' "$2"
}

# wp_sync_project <주소>: 한 Project의 카드와 이슈를 STATUS에 맞춘다.
wp_sync_project() {
  _url=$1
  _path=${_url#https://github.com/}
  case $_path in users/*) _kind=user ;; *) _kind=organization ;; esac
  _rest=${_path#*/}; _owner=${_rest%%/*}; _num=${_rest##*/}
  _pj="$WP_TMP/project.json"
  wp_read_project "$_kind" "$_owner" "$_num" "$_pj" || { wp_fail board "Project를 읽지 못함($_url). gh 토큰의 project 권한과 주소를 확인한다"; return 1; }
  _pid=$(jq -r --arg k "$_kind" '.data[$k].projectV2.id' "$_pj")

  # 필드와 선택지
  jq --arg k "$_kind" '[.data[$k].projectV2.fields.nodes[] | select(.name != null) | {key: .name, value: .}] | from_entries' "$_pj" > "$WP_TMP/fields.json"
  for _f in Status 줄기 지금 기다림 단계 ID; do
    jq -e --arg f "$_f" 'has($f)' "$WP_TMP/fields.json" > /dev/null || { wp_fail fields "Project에 「$_f」 필드가 없다($_url). board-setup.sh로 만든 템플릿에서 복사한 Project인지 확인한다"; return 1; }
  done
  _miss=$(jq -r --slurpfile d "$WP_TMP/desired.json" '
    ([.Status.options[].name]) as $s | ([.["단계"].options[].name]) as $p
    | [$d[0][] | (select(.status as $x | $s | index($x) | not) | "Status=" + .status), (select(.phase as $x | $p | index($x) | not) | "단계=" + .phase)] | unique | join(", ")' "$WP_TMP/fields.json")
  [ -z "$_miss" ] || { wp_fail fields "Project에 없는 선택지: $_miss($_url)"; return 1; }

  # 줄기: 처음 보는 값은 선택지를 더한다. 기존 선택지의 id를 함께 넘겨야 카드의 값이 지워지지 않는다.
  # 템플릿의 자리표시 선택지 「(없음)」(board-setup.sh가 만든다. 단일 선택 필드는 선택지가 하나 이상 있어야 한다)은
  # 이때 함께 지운다. STATUS에 그 값을 쓰는 줄이 있으면 남긴다.
  _new=$(jq -r --slurpfile d "$WP_TMP/desired.json" '([.["줄기"].options[].name]) as $o | [$d[0][] | .stem | select(. != "") | select(. as $x | $o | index($x) | not)] | unique | length' "$WP_TMP/fields.json")
  if [ "$_new" != 0 ]; then
    jq --slurpfile d "$WP_TMP/desired.json" '.["줄기"] as $f | ([$f.options[].name]) as $o | ([$d[0][] | .stem]) as $used
      | {query: "mutation($f: ID!, $o: [ProjectV2SingleSelectFieldOptionInput!]) { updateProjectV2Field(input: {fieldId: $f, singleSelectOptions: $o}) { projectV2Field { ... on ProjectV2SingleSelectField { options { id name color description } } } } }",
         variables: {f: $f.id, o: ([$f.options[] | select(.name != "(없음)" or ($used | index("(없음)"))) | {id, name, color, description: (.description // "")}]
           + ([$d[0][] | .stem | select(. != "") | select(. as $x | $o | index($x) | not)] | unique | map({name: ., color: "GRAY", description: ""})))}}' \
      "$WP_TMP/fields.json" > "$WP_TMP/stem.json"
    gh api graphql --input "$WP_TMP/stem.json" > "$WP_TMP/stem-out.json" || { wp_fail fields "줄기 선택지를 더하지 못함($_url)"; return 1; }
    jq --slurpfile o "$WP_TMP/stem-out.json" '.["줄기"].options = $o[0].data.updateProjectV2Field.projectV2Field.options' "$WP_TMP/fields.json" > "$WP_TMP/f2" && mv "$WP_TMP/f2" "$WP_TMP/fields.json"
    wp_log "줄기 선택지 추가: $(jq -r '[.["줄기"].options[].name] | join(", ")' "$WP_TMP/fields.json")"
  fi
  _fid_id=$(jq -r '.ID.id' "$WP_TMP/fields.json")

  # 가: 카드가 없는 줄(MERGED 제외) → 이슈를 찾거나 만들고 카드에 넣는다.
  jq -c --arg k "$_kind" --arg repo "$WP_REPO" "$WP_JQ_CARDS" "$_pj" > "$WP_TMP/cards.json"
  : > "$WP_TMP/added.tsv"
  jq -r --slurpfile c "$WP_TMP/cards.json" '.[] | select(.open) | select(.id as $i | $c[0] | map(.v.ID) | index($i) | not) | .id' "$WP_TMP/desired.json" |
    while IFS= read -r _id; do
      _title=$(jq -r --arg i "$_id" '.[] | select(.id == $i) | .title' "$WP_TMP/desired.json")
      _iurl=$(jq -r --arg i "$_id" '[.[] | select(.title | startswith("[" + $i + "] ") or . == ("[" + $i + "]"))] | sort_by(.number) | .[0].url // ""' "$WP_TMP/issues.json")
      if [ -z "$_iurl" ]; then
        printf '%s' "$WP_BODY" > "$WP_TMP/body.md"
        _iurl=$(gh issue create -R "$WP_REPO" --title "$_title" --label waypoint --body-file "$WP_TMP/body.md" < /dev/null) || { wp_fail issue "이슈를 만들지 못함($_id)"; exit 1; }
        _inum=${_iurl##*/}
        jq --argjson n "$_inum" --arg t "$_title" --arg u "$_iurl" '. + [{number: $n, title: $t, state: "OPEN", url: $u}]' "$WP_TMP/issues.json" > "$WP_TMP/i2" && mv "$WP_TMP/i2" "$WP_TMP/issues.json"
        wp_log "이슈 만듦 $_id $_iurl"
      fi
      _item=$(gh project item-add "$_num" --owner "$_owner" --url "$_iurl" --format json < /dev/null | jq -r .id) && [ -n "$_item" ] && [ "$_item" != null ] ||
        { wp_fail items "카드에 넣지 못함($_id, $_url)"; exit 1; }
      gh project item-edit --project-id "$_pid" --id "$_item" --field-id "$_fid_id" --text "$_id" < /dev/null > /dev/null ||
        { wp_fail field-edit "ID를 적지 못함($_id)"; exit 1; }
      printf '%s\t%s\n' "$_id" "$_item" >> "$WP_TMP/added.tsv"
      wp_log "카드 넣음 $_id ($_url)"
    done || return 1
  # 카드 없는 MERGED 줄: 카드는 만들지 않는다. 이전 실패로 열린 이슈만 남아 있으면 닫는다.
  jq -r --slurpfile c "$WP_TMP/cards.json" '.[] | select(.open | not) | select(.id as $i | $c[0] | map(.v.ID) | index($i) | not) | .id' "$WP_TMP/desired.json" |
    while IFS= read -r _id; do
      _inum=$(jq -r --arg i "$_id" '[.[] | select(.state == "OPEN") | select(.title | startswith("[" + $i + "] ") or . == ("[" + $i + "]"))] | sort_by(.number) | .[0].number // ""' "$WP_TMP/issues.json")
      [ -n "$_inum" ] || continue
      gh issue close "$_inum" -R "$WP_REPO" < /dev/null > /dev/null || { wp_fail issue "카드 없는 이슈를 닫지 못함($_id #$_inum)"; exit 1; }
      jq --argjson n "$_inum" 'map(if .number == $n then .state = "CLOSED" else . end)' "$WP_TMP/issues.json" > "$WP_TMP/i2" && mv "$WP_TMP/i2" "$WP_TMP/issues.json"
      wp_log "카드 없는 이슈를 닫음 $_id #$_inum"
    done || return 1
  # 카드를 넣었으면 다시 읽는다. GitHub은 쓰기 직후의 읽기에 새 카드나 그 ID 값을 늦게 보여 줄 수 있으므로(설계 10절),
  # 열린 줄의 카드가 모두 보일 때까지 잠깐씩 쉬며 몇 번 더 읽는다. 끝까지 안 보이면 보이는 카드만 마저 맞추고,
  # 그 카드의 필드는 맞추지 못했으므로 끝에서 실패로 기록한다.
  # WP_BOARD_SYNC_REREAD_WAITS: 다시 읽기 사이에 쉬는 초(공백으로 나눔). 테스트가 줄여 쓴다.
  _absent=$(wp_missing_cards)
  if [ -n "$_absent" ]; then
    _rr=0
    for _rw in 0 ${WP_BOARD_SYNC_REREAD_WAITS:-2 4 8}; do
      [ "$_rw" = 0 ] || sleep "$_rw"
      _rr=$((_rr + 1))
      wp_read_project "$_kind" "$_owner" "$_num" "$_pj" || { wp_fail board "Project를 다시 읽지 못함($_url)"; return 1; }
      jq -c --arg k "$_kind" --arg repo "$WP_REPO" "$WP_JQ_CARDS" "$_pj" > "$WP_TMP/cards.json"
      _absent=$(wp_missing_cards)
      [ -n "$_absent" ] || break
      wp_log "다시 읽음 ${_rr}번째: 아직 안 보이는 카드 $(wp_missing_why "$_kind" "$_pj" "$_absent") ($_url)"
    done
  fi

  # 나: 카드가 있는 줄 → 다른 것만 고친다. 고칠 호출을 gh 인자(@sh)로 만든다.
  jq -r --slurpfile c "$WP_TMP/cards.json" --slurpfile f "$WP_TMP/fields.json" --arg repo "$WP_REPO" --arg pid "$_pid" '
    $f[0] as $f
    | def opt($fname; $v): ([$f[$fname].options[] | select(.name == $v) | .id] | .[0]);
      def edit($card; $fname; $want):
        ($card.v[$fname] // "") as $cur
        | if $cur == $want then empty
          elif $want == "" then ["project", "item-edit", "--project-id", $pid, "--id", $card.item, "--field-id", $f[$fname].id, "--clear"]
          elif $f[$fname].dataType == "SINGLE_SELECT" then ["project", "item-edit", "--project-id", $pid, "--id", $card.item, "--field-id", $f[$fname].id, "--single-select-option-id", opt($fname; $want)]
          else ["project", "item-edit", "--project-id", $pid, "--id", $card.item, "--field-id", $f[$fname].id, "--text", $want] end;
    .[] as $d
    | ($c[0] | map(select(.v.ID == $d.id)) | .[0]) as $card
    | select($card != null)
    | (if $card.title != $d.title then ["issue", "edit", ($card.number|tostring), "-R", $repo, "--title", $d.title] else empty end),
      (if $d.open and $card.state == "CLOSED" then ["issue", "reopen", ($card.number|tostring), "-R", $repo] else empty end),
      (if ($d.open | not) and $card.state == "OPEN" then ["issue", "close", ($card.number|tostring), "-R", $repo] else empty end),
      edit($card; "Status"; $d.status), edit($card; "줄기"; $d.stem), edit($card; "지금"; $d.now),
      edit($card; "기다림"; $d.wait), edit($card; "단계"; $d.phase)
    | @sh' "$WP_TMP/desired.json" > "$WP_TMP/actions.txt" || { wp_fail field-edit "고칠 목록을 만들지 못함($_url)"; return 1; }
  while IFS= read -r _a; do
    eval "set -- $_a"
    gh "$@" < /dev/null > /dev/null || { wp_fail field-edit "gh $1 $2 실패($_url)"; return 1; }
  done < "$WP_TMP/actions.txt"
  wp_log "고침 $(wc -l < "$WP_TMP/actions.txt" | tr -d ' ')건 ($_url)"

  # STATUS에 없는 ID의 카드는 지우지 않고 경고만 남긴다
  jq -r --slurpfile d "$WP_TMP/desired.json" '.[] | select(.v.ID as $i | $d[0] | map(.id) | index($i) | not) | "\(.v.ID) #\(.number)"' "$WP_TMP/cards.json" |
    while IFS= read -r _w; do wp_log "경고: STATUS에 없는 카드 $_w ($_url)"; done
  [ -z "$_absent" ] || { wp_fail items "카드를 넣었지만 ${_rr}번 다시 읽어도 보이지 않아 필드를 맞추지 못함($_absent, $_url). 다음 push나 직접 실행 때 다시 맞춘다"; return 1; }
  return 0
}

# wp_lock [wait]: 잠금을 잡으면 0. 다른 동기화가 실행 중이면 2(wait가 아니면 재실행 표시를 남긴다).
# 잠금이 10분 넘게 풀리지 않으면 실패로 기록하고 1.
# 잠금 폴더는 mkdir로 원자적으로 만들고, 그 안에 started를 먼저, pid를 나중에 쓴다. pid가 아직 없는 잠금은
# 막 만들어지는 중이므로 남의 실행으로 본다(10분이 지나도 pid가 없으면 낡은 잠금).
wp_lock() {
  _lk="$WP_DIR/board-sync.lock"
  if mkdir "$_lk" 2> /dev/null; then
    date +%s > "$_lk/started"; echo $$ > "$_lk/pid.t" && mv "$_lk/pid.t" "$_lk/pid"
    return 0
  fi
  _pid=; _st=
  [ -r "$_lk/pid" ] && read -r _pid < "$_lk/pid"
  [ -r "$_lk/started" ] && read -r _st < "$_lk/started"
  case $_st in '' | *[!0-9]*) _st= ;; esac
  if [ -n "$_st" ]; then
    _age=$(( $(date +%s) - _st ))
  elif [ -n "$(find "$_lk" -maxdepth 0 -mmin +10 2> /dev/null)" ]; then
    _age=601
  else
    _age=0
  fi
  if [ -z "$_pid" ] && [ "$_age" -le 600 ] || { [ -n "$_pid" ] && kill -0 "$_pid" 2> /dev/null; }; then
    if [ "$_age" -gt 600 ]; then
      wp_fail lock "잠금이 오래 풀리지 않음(PID ${_pid:-없음}, ${_age}초). 그 프로세스를 확인한 뒤 $_lk를 지우고 다시 실행한다"
      return 1
    fi
    if [ "${1:-}" != wait ]; then
      : > "$WP_DIR/board-sync.rerun"
      wp_log "다른 동기화가 실행 중(PID ${_pid:-준비 중}). 끝난 뒤 다시 실행하도록 표시함"
    fi
    return 2
  fi
  rm -rf "$_lk"
  wp_log "오래된 잠금을 지움(PID ${_pid:-없음})"
  if mkdir "$_lk" 2> /dev/null; then
    date +%s > "$_lk/started"; echo $$ > "$_lk/pid.t" && mv "$_lk/pid.t" "$_lk/pid"
    return 0
  fi
  [ "${1:-}" = wait ] || : > "$WP_DIR/board-sync.rerun"
  return 2
}

# wp_unlock: 이 프로세스가 쥔 잠금만 푼다(trap에서도 부른다).
wp_unlock() {
  _p=
  [ -r "$WP_DIR/board-sync.lock/pid" ] && read -r _p < "$WP_DIR/board-sync.lock/pid"
  [ "$_p" = "$$" ] && rm -rf "$WP_DIR/board-sync.lock"
  return 0
}

# wp_run <커밋>: 그 커밋의 STATUS와 「보드:」 줄로 한 번 동기화한다.
wp_run() {
  _commit=$1
  WP_TMP=$(mktemp -d) || return 1
  git show "$_commit:CLAUDE.md" > "$WP_TMP/CLAUDE.md" 2>/dev/null || : > "$WP_TMP/CLAUDE.md"
  _urls=$(wp_board_urls "$WP_TMP/CLAUDE.md" 2> "$WP_TMP/urls.err")
  _bad=$(sed -n 's/^waypoint: 보드 주소 형식이 틀려 건너뛴다: //p' "$WP_TMP/urls.err" | tr '\n' ' ' | sed 's/ $//')
  # 「보드:」 줄이 없으면 할 일이 없다(실패가 아니다). 줄은 있는데 주소가 모두 틀리면 실패다.
  [ -n "$_urls" ] || [ -n "$_bad" ] || { rm -rf "$WP_TMP"; return 0; }
  wp_log "시작 commit=$_commit"
  [ -n "$_urls" ] || { wp_fail board "보드 주소 형식이 틀림: $_bad (https://github.com/users|orgs/<소유자>/projects/<번호> 꼴이어야 한다)"; rm -rf "$WP_TMP"; return 1; }
  for _t in gh jq; do
    command -v "$_t" > /dev/null 2>&1 || { wp_fail tools "PATH에서 $_t를 찾지 못함(PATH=$PATH)"; rm -rf "$WP_TMP"; return 1; }
  done
  git show "$_commit:docs/waypoint/STATUS.md" > "$WP_TMP/STATUS.md" 2>/dev/null || { wp_fail check "커밋 $_commit에 docs/waypoint/STATUS.md가 없다"; rm -rf "$WP_TMP"; return 1; }
  wp_status_check "$WP_TMP/STATUS.md" 2> "$WP_TMP/check.err" || { wp_fail check "STATUS 형식 검사 실패: $(head -n 1 "$WP_TMP/check.err")"; rm -rf "$WP_TMP"; return 1; }
  WP_REPO=$(wp_repo) || { wp_fail board "origin 원격에서 GitHub 레포를 알아내지 못함"; rm -rf "$WP_TMP"; return 1; }
  wp_desired_cards "$WP_TMP/STATUS.md" | jq -s . > "$WP_TMP/desired.json" || { wp_fail check "STATUS를 해석하지 못함"; rm -rf "$WP_TMP"; return 1; }

  gh issue list -R "$WP_REPO" --label waypoint --state all --limit 1000 --json number,title,state,url > "$WP_TMP/issues.json" 2> "$WP_TMP/gh.err" ||
    { wp_fail issue "이슈 목록을 읽지 못함: $(head -n 1 "$WP_TMP/gh.err")"; rm -rf "$WP_TMP"; return 1; }
  if ! gh label list -R "$WP_REPO" --search waypoint --json name --limit 100 | jq -e 'map(.name) | index("waypoint")' > /dev/null 2>&1; then
    gh label create waypoint -R "$WP_REPO" --color 5319E7 --description "waypoint 스테이지 이슈(STATUS에서 만들어짐)" > /dev/null 2>&1 ||
      { wp_fail issue "waypoint 라벨을 만들지 못함"; rm -rf "$WP_TMP"; return 1; }
  fi

  for _u in $_urls; do
    wp_sync_project "$_u" || { rm -rf "$WP_TMP"; return 1; }
  done
  if [ -n "$_bad" ]; then
    wp_fail board "보드 주소 형식이 틀려 건너뜀: $_bad. 나머지 Project는 맞췄다"
    rm -rf "$WP_TMP"
    return 1
  fi
  printf 'ok %s\n' "$(wp_now)" > "$WP_DIR/board-sync.status"
  wp_log "성공"
  rm -rf "$WP_TMP"
  return 0
}

wp_main() {
  _c=; _manual=1
  while [ $# -gt 0 ]; do
    case $1 in
      --commit)
        [ $# -ge 2 ] && [ -n "$2" ] || { echo "사용: board-sync.sh [--commit <sha>]" >&2; return 2; }
        _c=$2; _manual=; shift 2 ;;
      *) echo "사용: board-sync.sh [--commit <sha>]" >&2; return 2 ;;
    esac
  done
  _top=$(git rev-parse --show-toplevel) || return 1
  cd "$_top" || return 1
  if [ -z "$_c" ]; then
    _def=$(wp_default_branch) || { echo "waypoint 보드 동기화: 기본 브랜치를 찾지 못함" >&2; return 1; }
    _c=$(git rev-parse -q --verify "refs/heads/$_def^{commit}") || return 1
  fi
  # 보드를 쓰지 않는 레포: 아무것도 남기지 않고 끝낸다(실패가 아니다).
  git show "$_c:CLAUDE.md" 2>/dev/null | grep -qE '^[[:space:]]*- 보드:' || { [ -z "$_manual" ] || echo "waypoint 보드 동기화: CLAUDE.md에 「- 보드:」 줄이 없어 할 일이 없다"; return 0; }

  WP_DIR="$(git rev-parse --path-format=absolute --git-common-dir)/waypoint"
  mkdir -p "$WP_DIR" || return 1
  if [ -n "$_manual" ]; then
    # 직접 실행: 다른 동기화가 돌고 있으면 끝나기를 기다린다(2초 간격). 기다린 뒤에는 기본 브랜치 끝 커밋으로 한다.
    _said=
    while :; do
      wp_lock wait; _lrc=$?
      [ "$_lrc" = 2 ] || break
      [ -n "$_said" ] || { echo "waypoint 보드 동기화: 다른 동기화가 끝나기를 기다린다" >&2; _said=1; }
      sleep 2
    done
  else
    wp_lock; _lrc=$?
    [ "$_lrc" = 2 ] && return 0
  fi
  [ "$_lrc" = 0 ] || return 1
  trap wp_unlock EXIT

  _rc=0; _n=0
  while :; do
    wp_run "$_c"; _rc=$?
    _n=$((_n + 1))
    # 실행 중에 다른 push가 동기화를 청했으면, 기본 브랜치 끝 커밋(가장 최근 STATUS)으로 한 번 더 한다.
    if [ ! -e "$WP_DIR/board-sync.rerun" ]; then
      # 잠금을 푸는 사이에 들어온 요청도 놓치지 않는다: 풀고 나서 표시가 있으면 잠금을 다시 잡아 이어 간다.
      wp_unlock
      [ -e "$WP_DIR/board-sync.rerun" ] && [ "$_n" -lt 4 ] || break
      wp_lock wait || break
    fi
    if [ "$_n" -ge 4 ]; then
      wp_log "재실행 요청이 남음(4번 실행함). 다음 push나 직접 실행 때 반영된다"
      break
    fi
    rm -f "$WP_DIR/board-sync.rerun"
    _def=$(wp_default_branch) && _c=$(git rev-parse -q --verify "refs/heads/$_def^{commit}") || break
    wp_log "다시 실행(실행 중에 요청이 있었음)"
  done
  wp_unlock
  trap - EXIT
  if [ -f "$WP_DIR/board-sync.log" ] && [ "$(wc -l < "$WP_DIR/board-sync.log")" -gt 500 ]; then
    tail -n 500 "$WP_DIR/board-sync.log" > "$WP_DIR/board-sync.log.t" && mv "$WP_DIR/board-sync.log.t" "$WP_DIR/board-sync.log"
  fi
  if [ -n "$_manual" ]; then
    _st=
    [ -r "$WP_DIR/board-sync.status" ] && IFS= read -r _st < "$WP_DIR/board-sync.status"
    case $_st in
      ok*) echo "waypoint 보드 동기화: 성공(${_st#ok })" ;;
      *) echo "waypoint 보드 동기화: 실패. $WP_DIR/board-sync.status 와 board-sync.log 를 본다" >&2 ;;
    esac
  fi
  return "$_rc"
}

[ -n "${WP_BOARD_SYNC_LIB:-}" ] || { wp_main "$@"; exit $?; }
