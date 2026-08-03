#!/usr/bin/env bash
# GHOST RECORDS — Dangling DNS Detection for AWS Elastic IPs
# Finds Route53 A/CNAME records pointing at EIPs the account no longer owns.
# Usage: ./ghost_records.sh --profiles <P1,P2,...> [options]
# Prerequisites: AWS CLI v2, jq, dig. Read-only: SecurityAudit + ReadOnlyAccess.
# Author: Jai Sharma, Tom McCarthy — GoDaddy | License: MIT

set -o pipefail

VERSION="1.0.0"

# ─── ARGS ────────────────────────────────────────────────────────────────────
PROFILES=""
OUTPUT_DIR="./ghost_records_$(date +%Y%m%d_%H%M%S)"
API_TIMEOUT=12
MAX_PARALLEL=4
VERBOSE=0
JSON_OUTPUT=0
REGIONS_INPUT="all"

usage() {
  cat <<EOF
GHOST RECORDS v${VERSION} — Dangling DNS Detection for AWS Elastic IPs

Usage: $0 --profiles <PROFILE1,PROFILE2,...> [options]

Required:
  --profiles     Comma-separated AWS CLI profile names

Options:
  --regions      Comma-separated regions, or 'all' (default: all)
  --output-dir   Output directory (default: ./ghost_records_<timestamp>)
  --timeout      Per-API-call timeout in seconds (default: 12)
  --parallel     Max parallel region scans (default: 4)
  --verbose      Show matched (OK) records, not just findings
  --json         Also emit results.json
  --help

Examples:
  $0 --profiles prod-sa --verbose
  $0 --profiles acct1,acct2 --parallel 8 --json
  $0 --profiles prod-sa --regions us-east-1,us-west-2
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profiles|-p)   PROFILES="$2";      shift 2 ;;
    --regions)       REGIONS_INPUT="$2"; shift 2 ;;
    --output-dir|-o) OUTPUT_DIR="$2";    shift 2 ;;
    --timeout)       API_TIMEOUT="$2";   shift 2 ;;
    --parallel)      MAX_PARALLEL="$2";  shift 2 ;;
    --verbose|-v)    VERBOSE=1;          shift ;;
    --json)          JSON_OUTPUT=1;      shift ;;
    --version)       echo "ghost_records v${VERSION}"; exit 0 ;;
    --help|-h)       usage ;;
    *) echo "[ERROR] Unknown argument: $1"; usage ;;
  esac
done

[[ -z "$PROFILES" ]] && { echo "[ERROR] --profiles is required."; usage; }

mkdir -p "$OUTPUT_DIR/raw_json"

# ─── COLORS ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; ORANGE='\033[0;33m'; GREEN='\033[0;32m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
GREY='\033[2;37m'; WHITE='\033[1;37m'; BG_RED='\033[41m'; BG_GREEN='\033[42m'

log()      { echo -e "${BLUE}[INFO]${RESET}   $*"; }
ok()       { [[ "$VERBOSE" -eq 1 ]] && echo -e "${GREEN}[OK]${RESET}     $*"; }
warn()     { echo -e "${ORANGE}[WARN]${RESET}   $*"; }
crit()     { echo -e "${RED}[CRIT]${RESET}   $*"; }
vuln()     { echo -e "${BG_RED}${WHITE}[VULN]${RESET}   $*"; }
phase()    { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${RESET}\n"; }
prog()     { echo -ne "\r${GREY}  ↳ $*${RESET}"; }
prog_done(){ echo -e "\r${GREY}  ↳ $* ✓${RESET}"; }

CURRENT_PROFILE=""

# ─── PREREQS ─────────────────────────────────────────────────────────────────
check_prereqs() {
  local fail=0
  command -v jq  &>/dev/null || { echo "[ERROR] jq required (brew install jq / apt install jq)"; fail=1; }
  command -v aws &>/dev/null || { echo "[ERROR] AWS CLI v2 required"; fail=1; }
  command -v dig &>/dev/null || { echo "[ERROR] dig required (dnsutils / bind-utils)"; fail=1; }
  [[ $fail -eq 1 ]] && exit 1
  if ! command -v timeout &>/dev/null; then
    if command -v gtimeout &>/dev/null; then
      shopt -s expand_aliases; alias timeout='gtimeout'
    else
      warn "'timeout' not found — proceeding without call timeouts"
      timeout() { shift; "$@"; }
    fi
  fi
}
check_prereqs

PROFILE_ARRAY=()
while IFS= read -r p; do [[ -n "$p" ]] && PROFILE_ARRAY+=("$p"); done \
  < <(echo "$PROFILES" | tr ',' '\n')

# ─── BANNER ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}${RED}"
cat << 'BANNER'
   ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗
  ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝
  ██║  ███╗███████║██║   ██║███████╗   ██║
  ██║   ██║██╔══██║██║   ██║╚════██║   ██║
  ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║
   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝
  ██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ██████╗ ███████╗
  ██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗██╔════╝
  ██████╔╝█████╗  ██║     ██║   ██║██████╔╝██║  ██║███████╗
  ██╔══██╗██╔══╝  ██║     ██║   ██║██╔══██╗██║  ██║╚════██║
  ██║  ██║███████╗╚██████╗╚██████╔╝██║  ██║██████╔╝███████║
  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚══════╝
BANNER
echo -e "${RESET}"
echo -e "  ${GREY}Dangling DNS Detection for AWS Elastic IPs${RESET}"
echo -e "  ${GREY}v${VERSION}${RESET}"
echo ""
log "Profiles: ${PROFILE_ARRAY[*]}"
log "Regions:  ${REGIONS_INPUT}"
log "Output:   $OUTPUT_DIR"
echo ""

# ─── OUTPUT FILES ────────────────────────────────────────────────────────────
REPORT="$OUTPUT_DIR/report.md"
CSV_DANGLING="$OUTPUT_DIR/dangling_records.csv"
CSV_ATRISK="$OUTPUT_DIR/at_risk_records.csv"
CSV_EIP="$OUTPUT_DIR/eip_inventory.csv"
CSV_MAP="$OUTPUT_DIR/full_dns_map.csv"
JSON_RESULTS="$OUTPUT_DIR/results.json"

echo "record_name,record_type,target_ip,hosted_zone,account_id,detail" > "$CSV_DANGLING"
echo "record_name,record_type,target_ip,hosted_zone,account_id,eip_allocation_id,region,detail" > "$CSV_ATRISK"
echo "account_id,region,public_ip,allocation_id,attached_to,resource_type,name_tag,status" > "$CSV_EIP"
echo "record_name,record_type,target,hosted_zone,account_id,status,matched_resource" > "$CSV_MAP"

cat > "$REPORT" <<HEADER
# Ghost Records — Dangling DNS Report

**Tool:** Ghost Records v${VERSION}
**Date:** $(date '+%Y-%m-%d %H:%M:%S %Z')
**Profiles:** ${PROFILES}

---

HEADER

# ─── COUNTERS ────────────────────────────────────────────────────────────────
# Use individual variables instead of an associative array for bash 3.2 compat.
ST_accounts=0; ST_regions=0; ST_zones=0; ST_eips=0; ST_eips_idle=0
ST_a_records=0; ST_cname_records=0; ST_alias_skipped=0; ST_cname_skipped=0
ST_matched=0; ST_dangling=0; ST_at_risk=0; ST_failed_regions=0
inc() { local var="ST_$1"; eval "$var=\$(( \$$var + 1 ))"; }

SCAN_START=$(date +%s)

collect_region_eips() {
  local region="$1" eips_file="$2" map_file="$3" csv_file="$4" acct="$5" fail_file="$6"

  prog "Scanning $region..."

  local eip_json rc
  eip_json=$(timeout "${API_TIMEOUT}s" aws --profile "$CURRENT_PROFILE" \
    ec2 describe-addresses --region "$region" --output json 2>/dev/null)
  rc=$?
  if [[ $rc -ne 0 || -z "$eip_json" ]]; then
    echo "$region" >> "$fail_file"
    echo -e "\r${RED}  ↳ $region — FAILED (check credentials / region access)${RESET}"
    return
  fi

  echo "$eip_json" | jq -r '.Addresses[]? |
      [ .PublicIp,
        (.AllocationId // "-"),
        (.InstanceId // "-"),
        (.NetworkInterfaceId // "-"),
        (.AssociationId // "-"),
        ((.Tags // []) | map(select(.Key=="Name")) | .[0].Value // "-")
      ] | @tsv' 2>/dev/null | \
  while IFS=$'\t' read -r ip alloc iid eni assoc nametag; do
    [[ -z "$ip" ]] && continue

    local rtype="unassociated" attached="-" status="IDLE"

    if [[ "$iid" != "-" ]]; then
      rtype="EC2 Instance"; attached="$iid"; status="IN-USE"
    elif [[ "$eni" != "-" ]]; then
      local desc
      desc=$(timeout "${API_TIMEOUT}s" aws --profile "$CURRENT_PROFILE" \
        ec2 describe-network-interfaces --region "$region" \
        --network-interface-ids "$eni" \
        --query 'NetworkInterfaces[0].Description' --output text 2>/dev/null || echo "")
      attached="$eni"; status="IN-USE"
      case "$desc" in
        *"AWS Lambda"*)      rtype="Lambda ENI" ;;
        *"NAT Gateway"*|*nat-*) rtype="NAT Gateway" ;;
        *"ELB app/"*)        rtype="ALB ENI" ;;
        *"ELB net/"*)        rtype="NLB ENI" ;;
        *"ELB "*)            rtype="ELB ENI" ;;
        *"RDSNetworkInterface"*) rtype="RDS ENI" ;;
        "")                  rtype="ENI (unknown)" ;;
        *)                   rtype="ENI: ${desc:0:40}" ;;
      esac
    fi

    echo "$ip" >> "$eips_file"
    echo "${ip}|${rtype} ${attached} (${region})|${alloc}|${region}|${status}|${acct}" >> "$map_file"
    printf '%s,%s,%s,%s,%s,%s,%s,%s\n' \
      "$acct" "$region" "$ip" "$alloc" "$attached" "$rtype" "$nametag" "$status" >> "$csv_file"
  done

  prog_done "Scanned $region"
}

# =============================================================================
# PHASE 1: GLOBAL EIP INVENTORY (all profiles)
# =============================================================================
GLOBAL_EIPS="$OUTPUT_DIR/.eips_global"
GLOBAL_EIPMAP="$OUTPUT_DIR/.eipmap_global"
GLOBAL_DNS_LOOKUP="$OUTPUT_DIR/.dns_lookup_global"
VALID_PROFILES="$OUTPUT_DIR/.valid_profiles"
: > "$GLOBAL_EIPS"; : > "$GLOBAL_EIPMAP"
: > "$GLOBAL_DNS_LOOKUP"; : > "$VALID_PROFILES"

for CURRENT_PROFILE in "${PROFILE_ARRAY[@]}"; do
  [[ -z "$CURRENT_PROFILE" ]] && continue

  phase "PROFILE: $CURRENT_PROFILE"

  CALLER=$(timeout 10s aws --profile "$CURRENT_PROFILE" sts get-caller-identity --output json 2>/dev/null || echo "{}")
  if [[ "$CALLER" == "{}" ]]; then
    warn "Credentials invalid for '$CURRENT_PROFILE' — skipping"; continue
  fi
  ACCOUNT_ID=$(echo "$CALLER" | jq -r '.Account')
  log "Account:  $ACCOUNT_ID"
  log "Identity: $(echo "$CALLER" | jq -r '.Arn')"
  inc accounts

  echo "${CURRENT_PROFILE}|${ACCOUNT_ID}" >> "$VALID_PROFILES"
  ACCT_JSON="$OUTPUT_DIR/raw_json/${ACCOUNT_ID}"; mkdir -p "$ACCT_JSON"

  phase "Elastic IP Inventory [$ACCOUNT_ID]"

  EIPFAIL="$OUTPUT_DIR/.eipfail_${ACCOUNT_ID}"
  : > "$EIPFAIL"

  if [[ "$REGIONS_INPUT" == "all" ]]; then
    REGION_LIST=$(timeout 15s aws --profile "$CURRENT_PROFILE" \
      ec2 describe-regions --region us-east-1 \
      --query 'Regions[?OptInStatus!=`not-opted-in`].RegionName' \
      --output text 2>/dev/null || echo "us-east-1")
  else
    REGION_LIST=$(echo "$REGIONS_INPUT" | tr ',' ' ')
  fi
  REGION_COUNT=$(echo "$REGION_LIST" | wc -w | tr -d ' ')
  log "Scanning $REGION_COUNT region(s) for Elastic IPs"

  JOBS=0
  for region in $REGION_LIST; do
    collect_region_eips "$region" "$GLOBAL_EIPS" "$GLOBAL_EIPMAP" "$CSV_EIP" "$ACCOUNT_ID" "$EIPFAIL" &
    JOBS=$((JOBS+1)); inc regions
    if [[ "$JOBS" -ge "$MAX_PARALLEL" ]]; then wait -n 2>/dev/null || wait; JOBS=$((JOBS-1)); fi
  done
  wait
  echo ""

  EIP_COUNT=$(grep "|${ACCOUNT_ID}$" "$GLOBAL_EIPMAP" 2>/dev/null | wc -l | tr -d ' '); EIP_COUNT=${EIP_COUNT:-0}
  IDLE_COUNT=$(grep "|IDLE|${ACCOUNT_ID}$" "$GLOBAL_EIPMAP" 2>/dev/null | wc -l | tr -d ' '); IDLE_COUNT=${IDLE_COUNT:-0}
  FAILED_COUNT=$(wc -l < "$EIPFAIL" 2>/dev/null | tr -d ' '); FAILED_COUNT=${FAILED_COUNT:-0}
  ST_eips=$(( $ST_eips + EIP_COUNT ))
  ST_eips_idle=$(( $ST_eips_idle + IDLE_COUNT ))
  ST_failed_regions=$(( $ST_failed_regions + FAILED_COUNT ))

  log "Found ${BOLD}$EIP_COUNT${RESET} Elastic IP(s) — ${BOLD}$IDLE_COUNT${RESET} idle (unattached)"

  if [[ "$FAILED_COUNT" -gt 0 ]]; then
    warn "$FAILED_COUNT region(s) failed to enumerate: $(tr '\n' ' ' < "$EIPFAIL")"
    warn "EIPs in those regions are MISSING from inventory — findings may be false positives."
  fi
  rm -f "$EIPFAIL"
done

sort -u "$GLOBAL_EIPS" -o "$GLOBAL_EIPS"
TOTAL_EIPS=$(wc -l < "$GLOBAL_EIPS" 2>/dev/null | tr -d ' '); TOTAL_EIPS=${TOTAL_EIPS:-0}
TOTAL_ACCOUNTS=$(wc -l < "$VALID_PROFILES" 2>/dev/null | tr -d ' '); TOTAL_ACCOUNTS=${TOTAL_ACCOUNTS:-0}
if [[ "$TOTAL_ACCOUNTS" -gt 1 ]]; then
  log "Global EIP inventory: ${BOLD}$TOTAL_EIPS${RESET} unique IP(s) across $TOTAL_ACCOUNTS account(s)"
fi

# =============================================================================
# PHASE 2: ROUTE53 CROSS-REFERENCE (against global EIP inventory)
# =============================================================================
while IFS='|' read -r CURRENT_PROFILE ACCOUNT_ID; do
  [[ -z "$CURRENT_PROFILE" ]] && continue

  ACCT_JSON="$OUTPUT_DIR/raw_json/${ACCOUNT_ID}"

  phase "Route53 Cross-Reference [$ACCOUNT_ID]"

  ZONES=$(timeout 15s aws --profile "$CURRENT_PROFILE" route53 list-hosted-zones --output json 2>/dev/null || echo '{"HostedZones":[]}')
  echo "$ZONES" > "$ACCT_JSON/hosted_zones.json"
  log "$(echo "$ZONES" | jq '.HostedZones | length') hosted zone(s)"

  while IFS=$'\t' read -r zid zname zpriv; do
    [[ -z "$zid" ]] && continue
    ZID=$(echo "$zid" | sed 's|/hostedzone/||')
    ZDISP="${zname%.}"
    inc zones

    echo -e "\n  ${BOLD}▶ Zone: $ZDISP${RESET} ($ZID)"
    if [[ "$zpriv" == "true" ]]; then log "  Private zone — skipping"; continue; fi

    RECORDS=""; TOKEN=""; PAGE=0; PREV_TOKEN=""
    while true; do
      PAGE=$((PAGE+1))
      if [[ "$PAGE" -gt 50 ]]; then
        warn "  Pagination guard hit at 50 pages for $ZDISP — results may be truncated"
        break
      fi
      EXTRA=""; [[ -n "$TOKEN" ]] && EXTRA="--starting-token $TOKEN"
      # shellcheck disable=SC2086
      BATCH=$(timeout "${API_TIMEOUT}s" aws --profile "$CURRENT_PROFILE" \
        route53 list-resource-record-sets --hosted-zone-id "$ZID" \
        --max-items 300 $EXTRA --output json 2>/dev/null || echo '{"ResourceRecordSets":[]}')
      RECORDS="${RECORDS}$(echo "$BATCH" | jq -c '.ResourceRecordSets[]' 2>/dev/null)"$'\n'
      PREV_TOKEN="$TOKEN"
      TOKEN=$(echo "$BATCH" | jq -r '.NextToken // empty' 2>/dev/null)
      [[ -z "$TOKEN" ]] && break
      [[ "$TOKEN" == "$PREV_TOKEN" ]] && { warn "  Repeating pagination token for $ZDISP — stopping"; break; }
    done
    echo "$RECORDS" > "$ACCT_JSON/zone_${ZID}_records.jsonl"

    echo "$RECORDS" | jq -r '
      select(.Type == "A" and (.AliasTarget | not))
      | (.Name | rtrimstr(".")) as $n
      | .ResourceRecords[].Value
      | ($n + "|" + .)' 2>/dev/null >> "$GLOBAL_DNS_LOOKUP"

    eval_ip() {
      local rname="$1" rtype="$2" ip="$3" origin="$4"
      case "$ip" in
        0.0.0.0|10.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|192.168.*|127.*|169.254.*)
          ok "$rname -> $ip [skipped — non-routable IP]"
          echo "$rname,$rtype,$ip,$ZDISP,$ACCOUNT_ID,SKIPPED,non-routable-ip" >> "$CSV_MAP"
          return ;;
      esac
      if grep -qxF "$ip" "$GLOBAL_EIPS" 2>/dev/null; then
        local line res alloc reg stat eip_acct xacct=""
        line=$(grep "^${ip}|" "$GLOBAL_EIPMAP" | head -1)
        res=$(echo "$line" | cut -d'|' -f2)
        alloc=$(echo "$line" | cut -d'|' -f3)
        reg=$(echo "$line" | cut -d'|' -f4)
        stat=$(echo "$line" | cut -d'|' -f5)
        eip_acct=$(echo "$line" | cut -d'|' -f6)
        [[ "$eip_acct" != "$ACCOUNT_ID" ]] && xacct=" [owner: $eip_acct]"
        if [[ "$stat" == "IDLE" ]]; then
          warn "$rname -> $ip [AT-RISK — EIP allocated but not attached]$xacct"
          printf '%s,%s,%s,%s,%s,%s,%s,%s\n' \
            "$rname" "$rtype" "$ip" "$ZDISP" "$ACCOUNT_ID" "$alloc" "$reg" \
            "eip-allocated-but-idle${xacct:+ (owner: $eip_acct)}" >> "$CSV_ATRISK"
          echo "$rname,$rtype,$ip,$ZDISP,$ACCOUNT_ID,AT-RISK,$res${xacct}" >> "$CSV_MAP"
          inc at_risk
        else
          ok "$rname -> $ip — $res$xacct"
          echo "$rname,$rtype,$ip,$ZDISP,$ACCOUNT_ID,OK,$res${xacct}" >> "$CSV_MAP"
          inc matched
        fi
      else
        local ptr detail
        ptr=$(dig +short -x "$ip" 2>/dev/null | head -1); ptr="${ptr%.}"
        detail="ip-not-in-any-scanned-account"
        [[ -n "$ptr" ]] && detail="${detail}(PTR:$ptr)"
        [[ -n "$origin" ]] && detail="${detail}(via:$origin)"
        vuln "$rname -> $ip [DANGLING — not an EIP in any scanned account]"
        printf '%s,%s,%s,%s,%s,%s\n' \
          "$rname" "$rtype" "$ip" "$ZDISP" "$ACCOUNT_ID" "$detail" >> "$CSV_DANGLING"
        echo "$rname,$rtype,$ip,$ZDISP,$ACCOUNT_ID,DANGLING,$detail" >> "$CSV_MAP"
        inc dangling
      fi
    }

    while IFS= read -r rec; do
      [[ -z "$rec" ]] && continue
      RTYPE=$(echo "$rec" | jq -r '.Type' 2>/dev/null)
      RNAME=$(echo "$rec" | jq -r '.Name' 2>/dev/null); RNAME="${RNAME%.}"

      case "$RTYPE" in
        A)
          ALIAS=$(echo "$rec" | jq -r '.AliasTarget.DNSName // empty' 2>/dev/null)
          if [[ -n "$ALIAS" ]]; then
            inc alias_skipped
            ok "$RNAME -> ALIAS ${ALIAS%.} [skipped — ALIAS target]"
            echo "$RNAME,A-ALIAS,${ALIAS%.},$ZDISP,$ACCOUNT_ID,SKIPPED,alias-target" >> "$CSV_MAP"
            continue
          fi
          inc a_records
          while read -r ip; do
            [[ -z "$ip" ]] && continue
            echo "$ip" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || continue
            eval_ip "$RNAME" "A" "$ip" ""
          done < <(echo "$rec" | jq -r '.ResourceRecords[].Value' 2>/dev/null)
          ;;

        CNAME)
          inc cname_records
          CVAL=$(echo "$rec" | jq -r '.ResourceRecords[0].Value // empty' 2>/dev/null)
          CVAL="${CVAL%.}"
          [[ -z "$CVAL" ]] && continue

          R53_IPS=$(grep "^${CVAL}|" "$GLOBAL_DNS_LOOKUP" 2>/dev/null | cut -d'|' -f2)
          if [[ -n "$R53_IPS" ]]; then
            while read -r rip; do
              [[ -z "$rip" ]] && continue
              eval_ip "$RNAME" "CNAME" "$rip" "$CVAL"
            done <<< "$R53_IPS"
          else
            RESOLVED=$(dig +short "$CVAL" A 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -5)
            if [[ -z "$RESOLVED" ]]; then
              if dig "$CVAL" 2>/dev/null | grep -q "NXDOMAIN"; then
                crit "$RNAME -> CNAME $CVAL [target does not resolve — NXDOMAIN]"
                printf '%s,%s,%s,%s,%s,%s\n' \
                  "$RNAME" "CNAME" "$CVAL" "$ZDISP" "$ACCOUNT_ID" \
                  "cname-target-nxdomain" >> "$CSV_DANGLING"
                echo "$RNAME,CNAME,$CVAL,$ZDISP,$ACCOUNT_ID,DANGLING,cname-target-nxdomain" >> "$CSV_MAP"
                inc dangling
              else
                inc cname_skipped
                ok "$RNAME -> CNAME $CVAL [no A record — not IP-backed, skipped]"
                echo "$RNAME,CNAME,$CVAL,$ZDISP,$ACCOUNT_ID,SKIPPED,no-a-record" >> "$CSV_MAP"
              fi
            else
              while read -r rip; do
                [[ -z "$rip" ]] && continue
                eval_ip "$RNAME" "CNAME" "$rip" "$CVAL"
              done <<< "$RESOLVED"
            fi
          fi
          ;;
      esac
    done <<< "$RECORDS"

  done < <(echo "$ZONES" | jq -r '.HostedZones[] | [.Id, .Name, (.Config.PrivateZone|tostring)] | @tsv' 2>/dev/null)

done < "$VALID_PROFILES"

rm -f "$GLOBAL_EIPS" "$GLOBAL_EIPMAP" "$GLOBAL_DNS_LOOKUP" "$VALID_PROFILES"

SCAN_END=$(date +%s); DURATION=$(( SCAN_END - SCAN_START ))

# =============================================================================
# REPORT
# =============================================================================
{
  echo "## Summary"
  echo ""
  echo "| Metric | Count |"
  echo "|--------|-------|"
  echo "| Accounts scanned | $ST_accounts |"
  echo "| Regions scanned | $ST_regions |"
  echo "| Hosted zones | $ST_zones |"
  echo "| Elastic IPs inventoried | $ST_eips |"
  echo "| — of which idle (unattached) | $ST_eips_idle |"
  echo "| A records evaluated | $ST_a_records |"
  echo "| CNAME records evaluated | $ST_cname_records |"
  echo "| Matched (healthy) | $ST_matched |"
  echo "| **DANGLING** | **$ST_dangling** |"
  echo "| **AT-RISK** | **$ST_at_risk** |"
  echo "| Scan duration | ${DURATION}s |"
  echo ""

  D=$(( $(wc -l < "$CSV_DANGLING" 2>/dev/null | tr -d ' ') - 1 )); [[ $D -lt 0 ]] && D=0
  echo "## Dangling Records — takeover possible now"
  echo ""
  if [[ "$D" -gt 0 ]]; then
    echo "**$D dangling record(s) found.**"
    echo ""
    echo "| Record (subdomain) | Type | Target IP | Zone | Account | Detail |"
    echo "|--------------------|------|-----------|------|---------|--------|"
    tail -n +2 "$CSV_DANGLING" | while IFS=',' read -r n t ip z a d; do
      echo "| \`$n\` | $t | \`$ip\` | $z | $a | $d |"
    done
  else
    echo "No dangling records found."
  fi
  echo ""

  R=$(( $(wc -l < "$CSV_ATRISK" 2>/dev/null | tr -d ' ') - 1 )); [[ $R -lt 0 ]] && R=0
  echo "## At-Risk Records — one release-address from takeover"
  echo ""
  if [[ "$R" -gt 0 ]]; then
    echo "**$R at-risk record(s) found.**"
    echo ""
    echo "| Record (subdomain) | Type | EIP | Zone | Allocation | Region |"
    echo "|--------------------|------|-----|------|-----------|--------|"
    tail -n +2 "$CSV_ATRISK" | while IFS=',' read -r n t ip z a alloc reg d; do
      echo "| \`$n\` | $t | \`$ip\` | $z | \`$alloc\` | $reg |"
    done
  else
    echo "No at-risk records found."
  fi
  echo ""

  echo "## Coverage"
  echo ""
  echo "| Category | Count |"
  echo "|----------|-------|"
  echo "| A records evaluated | $ST_a_records |"
  echo "| CNAME records evaluated | $ST_cname_records |"
  echo "| ALIAS records skipped | $ST_alias_skipped |"
  echo "| CNAMEs skipped (no A record) | $ST_cname_skipped |"
  echo "| Regions failed to enumerate | $ST_failed_regions |"
  echo ""

  echo "## Remediation"
  echo ""
  echo "**Dangling — act now.** The IP is outside your scanned accounts and can be claimed by"
  echo "anyone allocating Elastic IPs in that region. Delete the DNS record, or"
  echo "re-allocate the address if the service is still needed."
  echo ""
  echo "**At-risk — fix before it becomes dangling.** Either attach the EIP to the"
  echo "resource it belongs to, or delete the DNS record and release the address"
  echo "together, in that order."
  echo ""
  echo "**Prevent recurrence.** Add DNS cleanup to IaC teardown so records and addresses"
  echo "are destroyed in the same operation."
  echo ""
  echo "*Generated by Ghost Records v${VERSION} on $(date '+%Y-%m-%d %H:%M:%S %Z')*"
} >> "$REPORT"

if [[ "$JSON_OUTPUT" -eq 1 ]]; then
  cat > "$JSON_RESULTS" <<JSONEOF
{
  "tool": "ghost_records",
  "version": "${VERSION}",
  "scan_date": "$(date -Iseconds)",
  "duration_seconds": ${DURATION},
  "summary": {
    "accounts": $ST_accounts,
    "regions": $ST_regions,
    "zones": $ST_zones,
    "eips": $ST_eips,
    "eips_idle": $ST_eips_idle,
    "a_records": $ST_a_records,
    "cname_records": $ST_cname_records,
    "alias_skipped": $ST_alias_skipped,
    "cname_skipped": $ST_cname_skipped,
    "failed_regions": $ST_failed_regions,
    "matched": $ST_matched,
    "dangling": $ST_dangling,
    "at_risk": $ST_at_risk
  }
}
JSONEOF
  log "JSON written to $JSON_RESULTS"
fi

# ─── SUMMARY ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  GHOST RECORDS — SCAN COMPLETE${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${GREY}Duration:${RESET}   ${DURATION}s"
echo -e "  ${GREY}Accounts:${RESET}   $ST_accounts   ${GREY}Regions:${RESET} $ST_regions   ${GREY}Zones:${RESET} $ST_zones"
echo -e "  ${GREY}Elastic IPs:${RESET} $ST_eips ($ST_eips_idle idle)"
echo -e "  ${GREY}Records:${RESET}    $ST_a_records A, $ST_cname_records CNAME"
echo ""
echo -e "  ${GREEN}Matched:${RESET}    $ST_matched"
echo -e "  ${GREY}Skipped:${RESET}    $ST_alias_skipped ALIAS, $ST_cname_skipped non-IP CNAME"
echo ""

if [[ "$ST_dangling" -gt 0 || "$ST_at_risk" -gt 0 ]]; then
  echo -e "  ${BG_RED}${WHITE} FINDINGS ${RESET}"
  echo ""

  if [[ "$ST_dangling" -gt 0 ]]; then
    echo -e "  ${RED}${BOLD}DANGLING — takeover possible now ($ST_dangling)${RESET}"
    tail -n +2 "$CSV_DANGLING" 2>/dev/null | while IFS=',' read -r n t ip z a d; do
      printf "    ${RED}%-42s${RESET} %-6s ${GREY}%s${RESET}\n" "$n" "$t" "$ip"
    done
    echo ""
  fi

  if [[ "$ST_at_risk" -gt 0 ]]; then
    echo -e "  ${ORANGE}${BOLD}AT-RISK — idle EIP, one release away ($ST_at_risk)${RESET}"
    tail -n +2 "$CSV_ATRISK" 2>/dev/null | while IFS=',' read -r n t ip z a alloc reg d; do
      printf "    ${ORANGE}%-42s${RESET} %-6s ${GREY}%-16s %s${RESET}\n" "$n" "$t" "$ip" "$alloc"
    done
    echo ""
  fi

else
  echo -e "  ${BG_GREEN}${WHITE} NO DANGLING RECORDS FOUND ${RESET}"
fi

if [[ "$ST_failed_regions" -gt 0 ]]; then
  echo ""
  warn "$ST_failed_regions region(s) failed to enumerate — EIP inventory is INCOMPLETE."
  warn "Findings above may include false positives. Re-run before acting on them."
fi
echo ""
echo -e "  ${BOLD}Outputs:${RESET}"
echo -e "    ${CYAN}Report:${RESET}        $REPORT"
echo -e "    ${CYAN}Dangling:${RESET}      $CSV_DANGLING"
echo -e "    ${CYAN}At-risk:${RESET}       $CSV_ATRISK"
echo -e "    ${CYAN}EIP inventory:${RESET} $CSV_EIP"
echo -e "    ${CYAN}Full DNS map:${RESET}  $CSV_MAP"
[[ "$JSON_OUTPUT" -eq 1 ]] && echo -e "    ${CYAN}JSON:${RESET}          $JSON_RESULTS"
echo ""
