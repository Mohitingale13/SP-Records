from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.services.qr_service import QRCodeService
from app.services.report_service import ReportService
from app.services.location_service import LocationService
from app.core.config import settings

router = APIRouter(prefix="/qr", tags=["QR Code"])


@router.get("/office-static", summary="Get permanent static office QR configuration")
def get_office_static_qr(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the organization's official static attendance QR token,
    office coordinates, and geofence radius.
    """
    token = QRCodeService.get_permanent_office_token(current_user.organization_id)
    office_lat, office_lon, radius = LocationService.get_office_geofence(
        db, str(current_user.organization_id)
    )

    return {
        "token": token,
        "raw_code": f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}",
        "organization_code": settings.ORGANIZATION_CODE,
        "organization_name": current_user.organization.name if current_user.organization else "Shivam Patsanstha",
        "office_latitude": office_lat,
        "office_longitude": office_lon,
        "geofence_radius_meters": radius,
        "verification_mode": "PERMANENT_QR_GPS",
    }


@router.get("/print-pdf", summary="Download high-resolution official printable A4 poster PDF")
def download_printable_qr_pdf(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates and returns an official, vector-sharp A4 PDF poster ready for printing
    and laminating at the Shivam Patsanstha office counter / entrance wall.
    """
    token = QRCodeService.get_permanent_office_token(current_user.organization_id)
    _, _, radius = LocationService.get_office_geofence(
        db, str(current_user.organization_id)
    )
    org_name = current_user.organization.name if current_user.organization else "Shivam Patsanstha"

    pdf_bytes = ReportService.generate_official_qr_poster_pdf(
        organization_name=org_name,
        qr_token_str=token,
        geofence_radius=radius,
    )

    filename = "Shivam_Patsanstha_Official_Attendance_QR.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

