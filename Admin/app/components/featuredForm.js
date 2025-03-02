import { useState} from "react";
import axios from "axios";
import { redirect } from "next/navigation";
import Image from "next/image";

export default function FeaturedForm({
title1:existingtitle1,
title2:existingtitle2,
phrase:existingphrase,
title1en:existingtitle1en,
title2en:existingtitle2en,
phraseen:existingphraseen,
title1ar:existingtitle1ar,
title2ar:existingtitle2ar,
phrasear:existingphrasear,
image:existingImage,
link:existinglink,
_id


}){

    const [title1,setTitle1]= useState(existingtitle1||'');
    const [title2,setTitle2]= useState(existingtitle2)||'';
    const [phrase, setPhrase] =useState(existingphrase||'');
    const [title1en,setTitle1en]= useState(existingtitle1en||'');
    const [title2en,setTitle2en]= useState(existingtitle2en||'');
    const [phraseen, setPhraseen] =useState(existingphraseen||'');
    const [title1ar,setTitle1ar]= useState(existingtitle1ar||'');
    const [title2ar,setTitle2ar]= useState(existingtitle2ar||'');
    const [phrasear, setPhrasear] =useState(existingphrasear||'');
    const [image, setImage] =useState(existingImage||'');
    const [link,setLink]= useState(existinglink||'');
    const [goToFeatureds,setgoToFeatureds]= useState(false);
    async function saveFeatured(ev){
        ev.preventDefault();

        const data = {title1,title2,phrase,title1en,title2en,phraseen,title1ar,title2ar,phrasear,image,link,};
        if(_id){
            await axios.put('/api/featured', {...data,_id});
            setgoToFeatureds(true);
         }else {

            await axios.post('/api/featured', data);
            setgoToFeatureds(true);
         }
            }
        if(goToFeatureds){
            return redirect('/featured')
        }





      return (

            <form onSubmit={saveFeatured}>
            <label>Grand Titre</label>
            <input type="text" placeholder="Grand Titre" value={title1} onChange={ev=> setTitle1(ev.target.value)}/>
            <label>Petit Titre</label>
            <input type="text" placeholder="Petit Titre" value={title2} onChange={ev=> setTitle2(ev.target.value)}/>
            <label>Phrase</label>
            <textarea placeholder="Phrase" value={phrase} onChange={ev=> setPhrase(ev.target.value)}></textarea>
            <label>Grand Titre EN</label>
            <input type="text" placeholder="Grand Titre" value={title1en} onChange={ev=> setTitle1en(ev.target.value)}/>
            <label>Petit Titre EN</label>
            <input type="text" placeholder="Petit Titre" value={title2en} onChange={ev=> setTitle2en(ev.target.value)}/>
            <label>Phrase EN</label>
            <textarea placeholder="Phrase" value={phraseen} onChange={ev=> setPhraseen(ev.target.value)}></textarea>
            <label>Grand Titre AR</label>
            <input type="text" placeholder="Grand Titre" value={title1ar} onChange={ev=> setTitle1ar(ev.target.value)}/>
            <label>Petit Titre AR</label>
            <input type="text" placeholder="Petit Titre" value={title2ar} onChange={ev=> setTitle2ar(ev.target.value)}/>
            <label>Phrase AR</label>
            <textarea placeholder="Phrase" value={phrasear} onChange={ev=> setPhrasear(ev.target.value)}></textarea>
            <label>Lien du produit</label>
            <input type="text" placeholder="lien du produit" value={link} onChange={ev=> setLink(ev.target.value)}/>
            <label className="text-xl">Photos</label>
            <input type="text" placeholder="lien d'arrire plan" value={image} onChange={ev=> setImage(ev.target.value)}/>
            <Image src={image} alt={`Image`} width={75} height={75} />



            <button className="bg-emerald-500 my-10 text-slate-200 rounded-lg p-2 text-xl  w-full" type="submit">Sauvegarder</button></form>

    )
}