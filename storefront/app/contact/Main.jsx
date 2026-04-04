'use client'
import { useTranslations } from 'next-intl';
import Layout from '../components/layout';
import React from "react";

export default function Contact() {
  const [result, setResult] = React.useState("");
  const t = useTranslations('contact');

  const onSubmit = async (event) => {
    event.preventDefault();
    setResult("Envoi en cours...");
    const formData = new FormData(event.target);

    formData.append("access_key", "REPLACE_WITH_WEB3FORMS_ACCESS_KEY");

    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      setResult("Message envoye");
      event.target.reset();
    } else {
      console.log("Error", data);
      setResult(data.message);
    }
  };

  return (
    <Layout>
      <div className="sf-container grid gap-6 py-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="sf-panel">
          <p className="sf-kicker">Contact</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{t("cntc")}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Questions sur une commande, disponibilite produit ou livraison. Utilisez le formulaire ou contactez directement l’equipe.
          </p>
        </section>

        <section className="sf-panel">
          <form onSubmit={onSubmit}>
            <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("nom")}</label>
            <input name="nom" className="sf-input mt-2 mb-6" placeholder="..." type='text' />
            <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("mail")}</label>
            <input name="email" className="sf-input mt-2 mb-6" placeholder="..." type='email' />
            <label className="block text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("msg")}</label>
            <textarea name="message" className="mt-2 min-h-[180px] w-full rounded-[1.5rem] border border-slate-300 bg-white px-4 py-3 text-base outline-none transition-all duration-200 focus:border-teal-600 focus:ring-2 focus:ring-teal-100" placeholder="..." />
            <button type="submit" className="sf-button mt-6 w-full justify-center">{t("env")}</button>
          </form>
          {result ? <span className="mt-4 block text-sm font-medium text-slate-600">{result}</span> : null}
        </section>

        <section className="sf-panel overflow-hidden p-0 lg:col-span-2">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3197.807304549801!2d3.1881410765364535!3d36.72718887181057!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x128e51067a4d7411%3A0x85e331ca5e381929!2sBricomaitre!5e0!3m2!1sfr!2sdz!4v1731869306787!5m2!1sfr!2sdz"
            className='h-[420px] w-full'
            height="450"
            language='ar'
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </section>
      </div>
    </Layout>
  );
}
