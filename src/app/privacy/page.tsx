import Link from "next/link";
import { org } from "@/lib/org";

export const metadata = {
  title: "Privacy notice - Trade Plate Record of Use",
};

// Rendered per request so the organisation's details come from the running
// environment rather than whatever was set at build time.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">
        Trade plate record of use
      </p>
      <h1 className="mt-1 text-2xl font-bold text-ink">Privacy notice</h1>
      <p className="mt-1 text-sm text-slate-600">
        How {org.name} handles the personal information collected by this system.
      </p>

      <div className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700">
        <Section title="What we collect">
          <p>
            When a trade plate is signed out and back in, this system records
            your name, your driver licence number if you enter it, your
            signature, the plate number, batch number, vehicle make and
            registration or VIN, the destination and purpose of the trip, and
            the date and time the plate went out and came back.
          </p>
          <p className="mt-2">
            It also records the IP address and browser string of the device used
            to make each entry, and the time the entry was saved. That is kept so
            an entry can be shown to be genuine.
          </p>
        </Section>

        <Section title="Why we collect it">
          <p>
            A record of use must be kept for each trade plate and produced on
            request. This system is that record. {org.name} also uses it to know
            which plate is out, who has it, and when it is due back.
          </p>
          <p className="mt-2">
            Your name and signature are what tie a particular trip to a
            particular driver. Without them the record does not do its job. Your
            licence number is optional.
          </p>
        </Section>

        <Section title="Who can see it">
          <p>
            Access is limited to the staff who administer plate use. The records
            are disclosed outside {org.name} only to Transport for NSW, the NSW
            Police Force, an insurer handling a claim, or another body with a
            lawful entitlement to them, and to the providers who host the system
            on our behalf.
          </p>
          <p className="mt-2">
            Signed-out details for the plate you are scanning are visible on that
            plate&apos;s page, along with the last few trips on it, so the next
            driver can see whether the plate is available. Nothing else is shown
            to drivers.
          </p>
        </Section>

        <Section title="Where it is held">
          <p>
            The records are held in a database hosted in Australia, encrypted in
            transit and at rest. The administration area is password protected.
            Records are not sold, and are not used for marketing.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Records are kept for {org.retentionYears} year
            {org.retentionYears === 1 ? "" : "s"} from the date of the trip, then
            deleted.
          </p>
        </Section>

        <Section title="Access, correction and complaints">
          <p>
            You can ask for a copy of the records about you, or ask for a
            correction, by contacting {org.privacyContact}
            {org.privacyEmail ? (
              <>
                {" at "}
                <a
                  href={`mailto:${org.privacyEmail}`}
                  className="font-medium text-brand underline"
                >
                  {org.privacyEmail}
                </a>
              </>
            ) : null}
            {org.privacyPhone ? ` or ${org.privacyPhone}` : ""}. Complaints about
            how your information has been handled go to the same contact. If you
            are not satisfied with the response you can take the complaint to the
            Office of the Australian Information Commissioner at oaic.gov.au.
          </p>
        </Section>

        <Section title="If you would rather not use this system">
          <p>
            Tell the office. A paper entry can be made instead. The same
            information is collected either way, because the record still has to
            be kept.
          </p>
        </Section>
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        <Link href="/" className="underline">
          Back to plates
        </Link>
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-1">{children}</div>
    </section>
  );
}
