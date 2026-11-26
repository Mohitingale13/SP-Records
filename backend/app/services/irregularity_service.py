from __future__ import annotations
import uuid
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.core.timezone import format_kolkata_time, get_current_kolkata_date
from app.models.attendance import AttendanceEventType, AttendanceRecord
from app.models.irregularity_action import IrregularityAction, IrregularityActionStatus
from app.models.role import Role, RoleName
from app.models.user import User
from app.services.report_service import format_report_date

# Threshold in seconds for flagging two consecutive punches as "same or +- 1-2 minutes"
CLOSE_PUNCH_THRESHOLD_SECONDS = 150  # 2.5 minutes

EVENT_LABELS_EN = {
    AttendanceEventType.OFFICE_IN.value: "Office In",
    AttendanceEventType.LUNCH_BREAK_OUT.value: "Lunch Break Out",
    AttendanceEventType.LUNCH_BREAK_IN.value: "Lunch Break In",
    AttendanceEventType.OFFICE_OUT.value: "Office Out",
}

EVENT_LABELS_MR = {
    AttendanceEventType.OFFICE_IN.value: "आगमन (Office In)",
    AttendanceEventType.LUNCH_BREAK_OUT.value: "जेवण ब्रेक आउट",
    AttendanceEventType.LUNCH_BREAK_IN.value: "जेवण ब्रेक इन",
    AttendanceEventType.OFFICE_OUT.value: "निर्गमन (Office Out)",
}


def _detect_uncommon_pairs(
    punches: Dict[str, AttendanceRecord],
    user_role_name: str,
) -> List[Tuple[AttendanceRecord, AttendanceRecord, int]]:
    """
    Detects pairs of punches that occurred within +- 1-2 minutes of each other.
    Applies the Admin exception: for ADMIN users, anything related to lunch timing
    (OFFICE_IN <-> LUNCH_BREAK_OUT, LUNCH_BREAK_OUT <-> LUNCH_BREAK_IN,
    LUNCH_BREAK_IN <-> OFFICE_OUT) is NOT flagged.
    """
    in_evt = punches.get(AttendanceEventType.OFFICE_IN.value)
    l_out_evt = punches.get(AttendanceEventType.LUNCH_BREAK_OUT.value)
    l_in_evt = punches.get(AttendanceEventType.LUNCH_BREAK_IN.value)
    out_evt = punches.get(AttendanceEventType.OFFICE_OUT.value)

    is_admin = user_role_name == RoleName.ADMIN.value

    candidate_pairs: List[Tuple[Optional[AttendanceRecord], Optional[AttendanceRecord], bool]] = [
        (in_evt, l_out_evt, is_admin),
        (l_out_evt, l_in_evt, is_admin),
        (l_in_evt, out_evt, is_admin),
        # Also check IN <-> OUT directly if no lunch punches exist (or for admin)
        (in_evt, out_evt, False if is_admin else bool(l_out_evt or l_in_evt)),
    ]

    flagged: List[Tuple[AttendanceRecord, AttendanceRecord, int]] = []
    for first, second, skip in candidate_pairs:
        if skip or not first or not second:
            continue
        # If Admin already manually corrected one of the events in the pair, treat as reviewed
        if first.is_manually_corrected or second.is_manually_corrected:
            continue
        diff_seconds = abs((second.scanned_at - first.scanned_at).total_seconds())
        if diff_seconds <= CLOSE_PUNCH_THRESHOLD_SECONDS:
            flagged.append((first, second, int(round(diff_seconds))))

    return flagged


class IrregularityService:
    @staticmethod
    def get_irregularities(
        db: Session,
        organization_id: uuid.UUID,
        days: int = 30,
        target_user_id: Optional[uuid.UUID] = None,
        for_member: bool = False,
    ) -> dict:
        today = get_current_kolkata_date()
        start_date = today - timedelta(days=days)

        user_query = (
            db.query(User)
            .join(Role, User.role_id == Role.id)
            .filter(
                User.organization_id == organization_id,
                User.is_active == True,
                Role.name != RoleName.SUPER_ADMIN.value,
            )
        )
        if target_user_id is not None:
            user_query = user_query.filter(User.id == target_user_id)

        staff_members = user_query.order_by(User.full_name.asc()).all()

        if not staff_members:
            return {
                "total_irregularities": 0,
                "missing_checkouts_count": 0,
                "not_marked_count": 0,
                "uncommon_timestamps_count": 0,
                "reported_count": 0,
                "pending_count": 0,
                "irregularities": [],
            }

        # Fetch all org attendance records in range so active_dates is accurate even for single-member view
        org_records = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.organization_id == organization_id,
                AttendanceRecord.event_date >= start_date,
                AttendanceRecord.event_date <= today,
            )
            .order_by(AttendanceRecord.event_date.desc(), AttendanceRecord.scanned_at.asc())
            .all()
        )

        # Group records by (user_id, event_date) -> dict of event_type: AttendanceRecord
        day_user_events: Dict[tuple, Dict[str, AttendanceRecord]] = {}
        active_dates = set()
        for r in org_records:
            active_dates.add(r.event_date)
            if target_user_id is not None and r.user_id != target_user_id:
                continue
            key = (r.user_id, r.event_date)
            if key not in day_user_events:
                day_user_events[key] = {}
            day_user_events[key][r.event_type] = r

        # Fetch member report/ignore actions
        action_query = db.query(IrregularityAction).filter(
            IrregularityAction.organization_id == organization_id,
            IrregularityAction.event_date >= start_date,
        )
        if target_user_id is not None:
            action_query = action_query.filter(IrregularityAction.user_id == target_user_id)
        actions_map: Dict[tuple, IrregularityAction] = {
            (a.user_id, a.irregularity_id): a for a in action_query.all()
        }

        candidate_dates = set(active_dates)
        for i in range(min(days, 7)):
            past_d = today - timedelta(days=i)
            if past_d.weekday() < 6:
                candidate_dates.add(past_d)
        sorted_dates = sorted(list(candidate_dates), reverse=True)

        irregularities: List[dict] = []
        missing_checkouts_count = 0
        not_marked_count = 0
        uncommon_timestamps_count = 0
        reported_count = 0
        pending_count = 0

        for check_date in sorted_dates:
            is_past_day = check_date < today
            date_records_exist = check_date in active_dates

            if is_past_day and not date_records_exist:
                continue

            for staff in staff_members:
                punches = day_user_events.get((staff.id, check_date), {})
                absent_evt = punches.get(AttendanceEventType.ABSENT.value) or punches.get("ABSENT")
                if absent_evt:
                    continue

                in_evt = punches.get(AttendanceEventType.OFFICE_IN.value)
                l_out_evt = punches.get(AttendanceEventType.LUNCH_BREAK_OUT.value)
                l_in_evt = punches.get(AttendanceEventType.LUNCH_BREAK_IN.value)
                out_evt = punches.get(AttendanceEventType.OFFICE_OUT.value)

                events_payload = [
                    {
                        "id": str(e.id),
                        "event_type": e.event_type,
                        "scanned_at": e.scanned_at.isoformat(),
                        "scanned_at_ist": format_kolkata_time(e.scanned_at),
                        "is_manually_corrected": e.is_manually_corrected,
                    }
                    for e in sorted(punches.values(), key=lambda x: x.scanned_at)
                ]

                role_name = staff.role.name if staff.role else RoleName.STAFF.value

                def _append_item(item: dict):
                    nonlocal missing_checkouts_count, not_marked_count, uncommon_timestamps_count, reported_count, pending_count
                    act = actions_map.get((staff.id, item["id"]))
                    member_status = act.status if act else "NONE"
                    if for_member and member_status == IrregularityActionStatus.IGNORED.value:
                        return

                    item["member_status"] = member_status
                    item["reported_at"] = act.updated_at.isoformat() if (act and member_status == IrregularityActionStatus.REPORTED.value) else None

                    if item["type"] == "MISSING_CHECKOUT":
                        missing_checkouts_count += 1
                    elif item["type"] == "NOT_MARKED":
                        not_marked_count += 1
                    elif item["type"] == "UNCOMMON_TIMESTAMPS":
                        uncommon_timestamps_count += 1

                    if member_status == IrregularityActionStatus.REPORTED.value:
                        reported_count += 1
                    elif member_status == "NONE":
                        pending_count += 1

                    irregularities.append(item)

                # Case 1: Staff member has NO records on this active working day
                if len(punches) == 0:
                    if is_past_day and date_records_exist:
                        _append_item({
                            "id": f"{staff.id}_{check_date.isoformat()}_NOT_MARKED",
                            "date": check_date.isoformat(),
                            "date_formatted": check_date.strftime("%d %b %Y (%a)"),
                            "date_formatted_mr": format_report_date(check_date, is_marathi=True),
                            "user_id": str(staff.id),
                            "user_name": staff.full_name,
                            "user_phone": staff.phone_number,
                            "user_role": role_name,
                            "type": "NOT_MARKED",
                            "severity": "warning",
                            "title": "Day Not Marked",
                            "title_mr": "दिवसाची हजेरी नोंद नाही (गैरहजर)",
                            "description": "No attendance was recorded on this working day.",
                            "description_mr": "या दिवशी कर्मचाऱ्याची कोणतीही हजेरी नोंद झालेली नाही.",
                            "in_time": None,
                            "out_time": None,
                            "events": [],
                        })
                    continue

                # Case 2: Checked in, but missing checkout
                if in_evt and not out_evt and is_past_day:
                    in_time_str = format_kolkata_time(in_evt.scanned_at)
                    _append_item({
                        "id": f"{staff.id}_{check_date.isoformat()}_MISSING_CHECKOUT",
                        "date": check_date.isoformat(),
                        "date_formatted": check_date.strftime("%d %b %Y (%a)"),
                        "date_formatted_mr": format_report_date(check_date, is_marathi=True),
                        "user_id": str(staff.id),
                        "user_name": staff.full_name,
                        "user_phone": staff.phone_number,
                        "user_role": role_name,
                        "type": "MISSING_CHECKOUT",
                        "severity": "danger",
                        "title": "Missing Check-Out",
                        "title_mr": "निर्गमन नोंद नाही (Check-Out विसरले)",
                        "description": f"Checked in at {in_time_str}, but forgot to check out.",
                        "description_mr": f"सकाळी {in_time_str} वाजता आगमन नोंदवले, पण जाताना निर्गमन नोंद नाही.",
                        "in_time": in_time_str,
                        "out_time": None,
                        "events": events_payload,
                    })

                # Case 3: Incomplete lunch break (went on lunch, never marked return, but punched out)
                # Exception: skip lunch-related checks for ADMIN
                elif l_out_evt and not l_in_evt and out_evt and role_name != RoleName.ADMIN.value:
                    l_out_time_str = format_kolkata_time(l_out_evt.scanned_at)
                    _append_item({
                        "id": f"{staff.id}_{check_date.isoformat()}_INCOMPLETE_BREAK",
                        "date": check_date.isoformat(),
                        "date_formatted": check_date.strftime("%d %b %Y (%a)"),
                        "date_formatted_mr": format_report_date(check_date, is_marathi=True),
                        "user_id": str(staff.id),
                        "user_name": staff.full_name,
                        "user_phone": staff.phone_number,
                        "user_role": role_name,
                        "type": "INCOMPLETE_BREAK",
                        "severity": "warning",
                        "title": "Incomplete Lunch Break",
                        "title_mr": "जेवण ब्रेक अपूर्ण (परत नोंद नाही)",
                        "description": f"Went on lunch break at {l_out_time_str}, but return punch was missing.",
                        "description_mr": f"दुपारी {l_out_time_str} वाजता जेवण ब्रेक नोंदवला, पण परत आल्याची नोंद नाही.",
                        "in_time": format_kolkata_time(in_evt.scanned_at) if in_evt else None,
                        "out_time": format_kolkata_time(out_evt.scanned_at),
                        "events": events_payload,
                    })

                # Case 4: Uncommon / Suspiciously Close Timestamps (+- 1-2 mins apart)
                close_pairs = _detect_uncommon_pairs(punches, role_name)
                if close_pairs:
                    pair_descs_en = []
                    pair_descs_mr = []
                    for first, second, diff_sec in close_pairs:
                        t1 = format_kolkata_time(first.scanned_at)
                        t2 = format_kolkata_time(second.scanned_at)
                        l1_en = EVENT_LABELS_EN.get(first.event_type, first.event_type)
                        l2_en = EVENT_LABELS_EN.get(second.event_type, second.event_type)
                        l1_mr = EVENT_LABELS_MR.get(first.event_type, first.event_type)
                        l2_mr = EVENT_LABELS_MR.get(second.event_type, second.event_type)
                        mins = max(0, round(diff_sec / 60))
                        gap_en = "same minute" if mins == 0 else f"{mins} min apart"
                        gap_mr = "एकाच मिनिटात" if mins == 0 else f"फक्त {mins} मिनिटांच्या फरकाने"
                        pair_descs_en.append(f"{l1_en} ({t1}) & {l2_en} ({t2}) — {gap_en}")
                        pair_descs_mr.append(f"{l1_mr} ({t1}) आणि {l2_mr} ({t2}) — {gap_mr}")

                    _append_item({
                        "id": f"{staff.id}_{check_date.isoformat()}_UNCOMMON_TIMESTAMPS",
                        "date": check_date.isoformat(),
                        "date_formatted": check_date.strftime("%d %b %Y (%a)"),
                        "date_formatted_mr": format_report_date(check_date, is_marathi=True),
                        "user_id": str(staff.id),
                        "user_name": staff.full_name,
                        "user_phone": staff.phone_number,
                        "user_role": role_name,
                        "type": "UNCOMMON_TIMESTAMPS",
                        "severity": "warning",
                        "title": "Unusual Punch Timing",
                        "title_mr": "असामान्य पंच वेळ (१-२ मिनिटांचा फरक)",
                        "description": "; ".join(pair_descs_en) + ".",
                        "description_mr": "; ".join(pair_descs_mr) + ".",
                        "in_time": format_kolkata_time(in_evt.scanned_at) if in_evt else None,
                        "out_time": format_kolkata_time(out_evt.scanned_at) if out_evt else None,
                        "events": events_payload,
                    })

        # For Admin view, surface member-reported items at the top while keeping date order
        if not for_member:
            irregularities.sort(
                key=lambda x: (0 if x.get("member_status") == "REPORTED" else 1, x["date"]),
                reverse=False,
            )
            # Re-sort within reported vs normal by date descending
            reported_items = [x for x in irregularities if x.get("member_status") == "REPORTED"]
            other_items = [x for x in irregularities if x.get("member_status") != "REPORTED"]
            reported_items.sort(key=lambda x: x["date"], reverse=True)
            other_items.sort(key=lambda x: x["date"], reverse=True)
            irregularities = reported_items + other_items

        return {
            "total_irregularities": len(irregularities),
            "missing_checkouts_count": missing_checkouts_count,
            "not_marked_count": not_marked_count,
            "uncommon_timestamps_count": uncommon_timestamps_count,
            "reported_count": reported_count,
            "pending_count": pending_count,
            "irregularities": irregularities,
        }

    @staticmethod
    def record_member_action(
        db: Session,
        user: User,
        irregularity_id: str,
        event_date: date,
        irregularity_type: str,
        action: IrregularityActionStatus,
    ) -> IrregularityAction:
        existing = (
            db.query(IrregularityAction)
            .filter(
                IrregularityAction.user_id == user.id,
                IrregularityAction.irregularity_id == irregularity_id,
            )
            .first()
        )
        if existing:
            existing.status = action.value
            existing.irregularity_type = irregularity_type
            existing.event_date = event_date
            db.commit()
            db.refresh(existing)
            return existing

        new_action = IrregularityAction(
            organization_id=user.organization_id,
            user_id=user.id,
            event_date=event_date,
            irregularity_id=irregularity_id,
            irregularity_type=irregularity_type,
            status=action.value,
        )
        db.add(new_action)
        db.commit()
        db.refresh(new_action)
        return new_action

