'use client';
import { useTranslations } from 'next-intl';
import {
  checkoutFieldNames,
  setCheckoutField,
  type CheckoutFields,
} from '@bric/storefront-core/settings';
import { Switch } from '../ui/switch';

export function CheckoutFieldsSettings({
  value,
  onChange,
}: {
  value: CheckoutFields;
  onChange: (value: CheckoutFields) => void;
}) {
  const t = useTranslations('storefrontSettings.checkout');
  return (
    <section className="space-y-3 border-t border-border/70 pt-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="text-sm text-muted-foreground" id="checkout-field-rules">
        {t('description')}
      </p>
      <table className="w-full text-sm" aria-describedby="checkout-field-rules">
        <thead>
          <tr className="border-b border-border/70">
            <th scope="col" className="py-3 text-start font-medium">
              {t('field')}
            </th>
            <th scope="col" className="w-24 py-3 font-medium">
              {t('active')}
            </th>
            <th scope="col" className="w-24 py-3 font-medium">
              {t('required')}
            </th>
          </tr>
        </thead>
        <tbody>
          {checkoutFieldNames.map((name) => (
            <tr key={name} className="border-b border-border/50">
              <th scope="row" className="py-3 text-start font-medium">
                {t(name)}
                {name === 'phoneNumber1' || name === 'homeAddress' ? (
                  <span
                    id={`checkout-${name}-hint`}
                    className="mt-1 block text-xs font-normal text-muted-foreground"
                  >
                    {t(`${name}Hint`)}
                  </span>
                ) : null}
              </th>
              {(['active', 'required'] as const).map((option) => (
                <td key={option} className="text-center">
                  <Switch
                    checked={value[name][option]}
                    disabled={name === 'phoneNumber1'}
                    aria-label={`${t(name)} · ${t(option)}`}
                    aria-describedby={
                      name === 'phoneNumber1' || name === 'homeAddress'
                        ? `checkout-${name}-hint`
                        : undefined
                    }
                    onCheckedChange={(checked) =>
                      onChange(setCheckoutField(value, name, option, checked))
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
