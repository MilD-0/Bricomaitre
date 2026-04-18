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
      setResult("Message envoyé");
      event.target.reset();
    } else {
      console.log("Error", data);
      setResult(data.message);
    }
  };

  return (
    <Layout>
      <div>
        <div className='text-center text-2xl font-semibold mt-10 mb-5'>{t("cntc")}</div>
        <div className='p-4 flex-col'>
          <form onSubmit={onSubmit}>
          <label className='text-lg block'>{t("nom")}</label>
          <input name="nom" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black w-full rounded  text-lg px-2 py-1 required outline-none transition-all duration-500" placeholder="..." type='text'></input>
          <label className='text-lg block'>{t("mail")}</label>
          <input name="email" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black w-full rounded  text-lg px-2 py-1 required outline-none transition-all duration-500" placeholder="..." type='email'></input>
          <label className='text-lg block'>{t("msg")}</label>
          <textarea name="message" className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black w-full rounded  text-lg px-2 py-1 required outline-none transition-all duration-500" placeholder="..." ></textarea>
          <button type="submit" className="bg-teal-600 px-6 py-2 w-full rounded-lg text-xl font-semibold text-white">{t("env")}</button>
        </form>
        </div>
        <span>{result}</span>
        <div>
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3197.807304549801!2d3.1881410765364535!3d36.72718887181057!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x128e51067a4d7411%3A0x85e331ca5e381929!2sBricomaitre!5e0!3m2!1sfr!2sdz!4v1731869306787!5m2!1sfr!2sdz" className='w-full' height="450" language='ar'  allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      </div>

    </Layout>

  );
}
