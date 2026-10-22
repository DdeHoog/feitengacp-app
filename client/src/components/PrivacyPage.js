import React from 'react';

// Privacy statement of the customer portal — DRAFT (2026-10-21) for Ad to check before it is
// linked from the footer. Written from what the app actually does; keep it in step when a
// feature starts storing something new (that's the GDPR's transparency duty, not decoration).
// <Todo> marks facts only Feiteng can fill in — they are highlighted so none slips through.
const Todo = ({ children }) => <mark className="bg-amber-200 px-1 rounded">[{children}]</mark>;

const H2 = ({ children }) => <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">{children}</h2>;

function PrivacyPage() {
    return (
        <div className="p-4 lg:mr-brand-bar-lg xl:mr-brand-bar-xl">
            <article className="max-w-3xl text-gray-700 leading-relaxed space-y-3">
                <h1 className="text-2xl font-bold text-[#004EA2]">Privacy statement — customer portal</h1>
                <p className="text-sm text-gray-500">Last updated: <Todo>date of publication</Todo></p>

                <p>
                    This statement explains which personal data the Feiteng customer portal
                    (www.feitengacp.eu) processes, why, and for how long. The portal is meant for
                    business customers of Feiteng Composites (Europe) B.V.
                </p>

                <H2>Who is responsible</H2>
                <p>
                    Feiteng Composites (Europe) B.V., Industriestraat 4, 5804 CK Venray, The Netherlands
                    (Chamber of Commerce no. <Todo>KvK number</Todo>) is the controller for the data
                    described here. Questions or requests: <a href="mailto:sales@feitengacp.eu" className="text-[#004EA2] underline">sales@feitengacp.eu</a>{' '}
                    <Todo>or a dedicated privacy address</Todo>.
                </p>

                <H2>What we process and why</H2>
                <ul className="list-disc pl-6 space-y-2">
                    <li>
                        <strong>Your account.</strong> Your name, e-mail address, company, debtor number and
                        delivery address come from our customer administration (Exact Online), where you
                        are already registered as our customer. We use them to let you log in and to fill
                        in your orders. Your login code is checked against that administration and is not
                        stored by the portal. <em>Basis: performance of our agreement with your company.</em>
                    </li>
                    <li>
                        <strong>Orders.</strong> For each order we record the articles and quantities, your
                        references, the desired shipping date, the delivery address and the name, e-mail
                        address and phone number of the person ordering. The order is e-mailed to our sales
                        department and a copy to you. <em>Basis: agreement; legal obligation to keep business records.</em>
                    </li>
                    <li>
                        <strong>Forecasts.</strong> If you enter an expected volume per month, we store it to
                        plan production. It is not an order. <em>Basis: agreement.</em>
                    </li>
                    <li>
                        <strong>Login history.</strong> The date and time of each successful login to your
                        account, to support you and to detect misuse of an account.{' '}
                        <em>Basis: our legitimate interest in a secure portal.</em>
                    </li>
                    <li>
                        <strong>News.</strong> When a news item has been on your screen for a couple of
                        seconds, and when you click its link, we record that once per item with the time.
                        This tells us whether our news reaches our customers; it is not used for anything
                        else and not shared. <em>Basis: our legitimate interest in informing our customers.</em>
                    </li>
                    <li>
                        <strong>Technical logs.</strong> Our server records requests (including the IP
                        address) and login attempts to keep the portal running and to block password
                        guessing. <em>Basis: legitimate interest (security).</em>
                    </li>
                </ul>
                <p>We do not sell your data, do not use it for advertising and do not make automated decisions about you.</p>

                <H2>Cookies and local storage</H2>
                <p>
                    The portal places <strong>no cookies</strong> and uses no analytics, tracking or
                    advertising services. Your browser's local storage keeps two things: your login
                    session (so you stay logged in for up to an hour) and the contents of your cart.
                    Both are strictly necessary for the portal to work, so no consent is asked for them.
                    Logging out removes the session. Links to feitengacp.com and other sites open those
                    sites, which have their own privacy statements.
                </p>

                <H2>Who receives your data</H2>
                <ul className="list-disc pl-6 space-y-1">
                    <li>Exact (Exact Online) — our business administration, where your account data comes from.</li>
                    <li>Microsoft (Microsoft 365) — sends the order e-mails.</li>
                    <li><Todo>Hosting provider name + country of the server</Todo> — hosts the portal.</li>
                </ul>
                <p>
                    These parties process data on our behalf under a processing agreement.{' '}
                    <Todo>Confirm: data stays within the EU/EEA, or name the safeguard (e.g. EU-US Data Privacy Framework).</Todo>
                </p>

                <H2>How long we keep it</H2>
                <ul className="list-disc pl-6 space-y-1">
                    <li>Account data: as long as you have access to the portal.</li>
                    <li>Orders: <Todo>7 years</Todo> (statutory retention of business records).</li>
                    <li>Forecasts: <Todo>2 years</Todo>.</li>
                    <li>Login history and news views: <Todo>2 years</Todo>.</li>
                    <li>Technical logs: <Todo>a few weeks</Todo>; database backups: 30 days.</li>
                </ul>

                <H2>Your rights</H2>
                <p>
                    You may ask to see, correct or delete your personal data, to restrict its use, to
                    object to processing based on our legitimate interest, and to receive your data in a
                    usable format. Send your request to the address above; we answer within one month.
                    You can also lodge a complaint with the Dutch Data Protection Authority (Autoriteit
                    Persoonsgegevens, <a href="https://autoriteitpersoonsgegevens.nl" target="_blank" rel="noopener noreferrer" className="text-[#004EA2] underline">autoriteitpersoonsgegevens.nl</a>).
                </p>

                <H2>Security</H2>
                <p>
                    The portal is only reachable over an encrypted connection (HTTPS), access is limited to
                    logged-in customers, repeated failed logins are blocked, and backups are kept in a
                    restricted location.
                </p>
            </article>
        </div>
    );
}

export default PrivacyPage;
