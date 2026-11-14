import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from app.config import (
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
)

logger = logging.getLogger("sushrutha.email")


def smtp_is_configured() -> bool:
    return bool((SMTP_USER or "").strip() and (SMTP_PASSWORD or "").strip())


def _dispatch_email(
    *,
    to_email: str,
    subject: str,
    text_content: str,
    html_content: str,
    console_label: str,
    require_live: bool = False,
) -> dict:
    """
    Shared SMTP sender.
    require_live=True → fail if SMTP missing/broken (password reset).
    require_live=False → log to console when SMTP missing (follow-up reminders).
    """
    to_email = (to_email or "").strip().lower()
    if not to_email:
        raise RuntimeError("Recipient email is missing.")

    if smtp_is_configured():
        smtp_user = (SMTP_USER or "").strip()
        smtp_pass = (SMTP_PASSWORD or "").replace(" ", "").strip()
        smtp_from = (SMTP_FROM_EMAIL or smtp_user).strip()
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{SMTP_FROM_NAME} <{smtp_from}>"
            msg["To"] = to_email
            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            with smtplib.SMTP(SMTP_HOST, int(SMTP_PORT), timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(smtp_user, smtp_pass)
                refused = server.sendmail(smtp_from, [to_email], msg.as_string())

            if refused:
                raise RuntimeError(f"SMTP refused recipients: {refused}")

            logger.info("Email sent (%s) to %s", console_label, to_email)
            return {"sent": True, "mode": "live_smtp", "to": to_email}
        except Exception as exc:
            logger.exception("SMTP send failed (%s) for %s", console_label, to_email)
            if require_live:
                raise RuntimeError(
                    "Could not send email right now. Check SMTP settings or try again in a minute."
                ) from exc
            return {"sent": False, "mode": "smtp_failed", "to": to_email, "error": str(exc)[:200]}

    print("\n=======================================================")
    print(f"[EMAIL SERVICE - SIMULATED — {console_label}]")
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    print(text_content[:500])
    print("=======================================================\n")
    logger.warning("SMTP not configured; simulated %s for %s", console_label, to_email)

    if require_live:
        return {
            "sent": True,
            "mode": "simulated",
            "to": to_email,
            "message": "Email service is not fully configured; code logged to server console.",
        }
    return {"sent": True, "mode": "simulated", "to": to_email}


def send_password_reset_email(to_email: str, patient_name: str, otp_code: str) -> dict:
    subject = "Sushrutha Grid — Password reset code"
    html_content = f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"></head>
    <body style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:20px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Sushrutha Grid</h1>
        <p style="color:#334155;font-size:14px;line-height:1.55;">Hello <strong>{patient_name or 'User'}</strong>,</p>
        <p style="color:#334155;font-size:14px;line-height:1.55;">Use this 6-digit code to reset your password. It expires in 15 minutes.</p>
        <div style="background:#eff6ff;border:2px dashed #3b82f6;border-radius:8px;padding:16px;text-align:center;margin:20px 0;">
          <div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#1d4ed8;">{otp_code}</div>
        </div>
        <p style="font-size:13px;color:#9a3412;"><strong>Important:</strong> This replaces any older reset code. Use only this latest email.</p>
        <p style="font-size:13px;color:#64748b;">If you did not request this, ignore this email.</p>
      </div>
    </body></html>
    """
    text_content = (
        f"Sushrutha Grid — Password reset\n\nHello {patient_name or 'User'},\n\n"
        f"Your 6-digit code is: {otp_code}\nValid for 15 minutes.\n\n"
        f"Use only this latest email. Older codes are cancelled.\n"
    )
    result = _dispatch_email(
        to_email=to_email,
        subject=subject,
        text_content=text_content,
        html_content=html_content,
        console_label="PASSWORD RESET",
        require_live=True,
    )
    result["message"] = result.get("message") or f"Password reset code sent to {to_email}."
    return result


def send_followup_reminder_email(
    *,
    to_email: str,
    patient_name: Optional[str],
    title: str,
    message: str,
    follow_up_on: Optional[str] = None,
    department: Optional[str] = None,
    doctor_name: Optional[str] = None,
    hospital_name: Optional[str] = None,
    prescription_id: Optional[str] = None,
) -> dict:
    """Day-before / day-of follow-up reminder to the patient's registered email."""
    subject = f"Sushrutha Grid — {title or 'Follow-up reminder'}"
    dept = department or "OPD"
    doctor = doctor_name or "your doctor"
    hospital = hospital_name or "the hospital"
    when = follow_up_on or "your scheduled date"

    html_content = f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"></head>
    <body style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:20px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
        <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Sushrutha Grid</h1>
        <p style="margin:0 0 4px;font-size:12px;font-weight:800;color:#c2410c;text-transform:uppercase;">Follow-up reminder</p>
        <p style="color:#334155;font-size:14px;line-height:1.55;">Hello <strong>{patient_name or 'Patient'}</strong>,</p>
        <p style="color:#0f172a;font-size:16px;font-weight:700;">{title}</p>
        <p style="color:#334155;font-size:14px;line-height:1.55;">{message}</p>
        <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:12px 14px;margin:16px 0;font-size:13px;color:#9a3412;line-height:1.5;">
          <div><strong>Date:</strong> {when}</div>
          <div><strong>Department:</strong> {dept}</div>
          <div><strong>Doctor:</strong> {doctor}</div>
          <div><strong>Hospital:</strong> {hospital}</div>
          {f'<div><strong>Rx:</strong> {prescription_id}</div>' if prescription_id else ''}
        </div>
        <p style="font-size:13px;color:#64748b;">Open the Sushrutha patient app → Care → Follow-ups for details. Bring prior reports and your prescription.</p>
      </div>
    </body></html>
    """
    text_content = (
        f"Sushrutha Grid — Follow-up reminder\n\n"
        f"Hello {patient_name or 'Patient'},\n\n"
        f"{title}\n{message}\n\n"
        f"Date: {when}\nDepartment: {dept}\nDoctor: {doctor}\nHospital: {hospital}\n"
        f"{('Rx: ' + prescription_id + chr(10)) if prescription_id else ''}"
        f"\nOpen Care → Follow-ups in the app.\n"
    )
    return _dispatch_email(
        to_email=to_email,
        subject=subject,
        text_content=text_content,
        html_content=html_content,
        console_label="FOLLOW-UP REMINDER",
        require_live=False,
    )
