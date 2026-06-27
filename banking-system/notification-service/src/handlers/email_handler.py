import logging
import os

logger = logging.getLogger(__name__)
MOCK_EXTERNAL = os.getenv("MOCK_EXTERNAL", "true").lower() == "true"


def send_payment_confirmation(to_email: str, payment_id: str, amount: float, currency: str):
    """Send payment confirmation email via SendGrid (or mock)."""
    if MOCK_EXTERNAL:
        logger.info(
            f"[MOCK EMAIL] To: {to_email} | Payment {payment_id} confirmed: {amount} {currency}"
        )
        return

    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail

    sg = SendGridAPIClient(os.getenv("SENDGRID_API_KEY"))
    message = Mail(
        from_email=os.getenv("SENDGRID_FROM_EMAIL", "noreply@bank.example.com"),
        to_emails=to_email,
        subject=f"Payment Confirmed: {currency} {amount:.2f}",
        html_content=(
            f"<p>Your payment of {currency} {amount:.2f} "
            f"(ref: {payment_id}) has been processed successfully.</p>"
        ),
    )
    sg.send(message)
    logger.info(f"Email sent to {to_email} for payment {payment_id}")


def send_account_update_digest(to_email: str, account_id: str, new_balance: float, currency: str):
    """Send account balance update email."""
    if MOCK_EXTERNAL:
        logger.info(
            f"[MOCK EMAIL] To: {to_email} | Account {account_id} balance: {currency} {new_balance:.2f}"
        )
        return

    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail

    sg = SendGridAPIClient(os.getenv("SENDGRID_API_KEY"))
    message = Mail(
        from_email=os.getenv("SENDGRID_FROM_EMAIL", "noreply@bank.example.com"),
        to_emails=to_email,
        subject=f"Account Update: {currency} {new_balance:.2f}",
        html_content=(
            f"<p>Your account <strong>{account_id}</strong> balance has been updated to "
            f"{currency} {new_balance:.2f}.</p>"
        ),
    )
    sg.send(message)
    logger.info(f"Account digest sent to {to_email} for account {account_id}")
