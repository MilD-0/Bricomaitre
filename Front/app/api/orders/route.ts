import dbConnect from "@/app/lib/dbConnect";
import Order from "@/app/models/order";
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const PIXEL_ID = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
  const TOKEN = process.env.TOKEN;

  const hashData = (data: string) => {
    return crypto.createHash("sha256").update(data).digest("hex");
  };
  await dbConnect();

  const {
    firstName,
    lastName,
    state,
    city,
    homeAddress,
    email,
    phoneNumber1,
    phoneNumber2,
    cartProducts,
    delivery,
    del_pr,
    price,
    variant,
    total,
    time,
    ev_id,
    fbp,
    fbc,
  } = await request.json();
  try {
    Order.create({
      firstName,
      lastName,
      state,
      city,
      homeAddress,
      email,
      phoneNumber1,
      phoneNumber2,
      cartProducts,
      delivery,
      del_pr,
      price,
      variant,
    });
    axios.post(
      `https://graph.facebook.com/v22.0/${PIXEL_ID}/events?access_token=${TOKEN}`,
      {
        data: [
          {
            event_name: "Purchase",
            event_time: time,
            action_source: "website",
            event_id: ev_id,
            user_data: {
              ph: hashData(phoneNumber1),
              client_ip_address: (request.headers.get("x-forwarded-for") || "")
                .split(",")[0]
                .trim(),
              client_user_agent: request.headers.get("user-agent"),
              ln: hashData(lastName),
              fn: hashData(firstName),
              st: hashData(state),
              fbp: fbp,
              fbc: fbc,
            },
            custom_data: {
              currency: "DZD",
              value: total,
              content_ids: cartProducts,
            },
            original_event_data: {
              event_name: "Purchase",
              event_time: time,
            },
          },
        ],
      }
    );
    return NextResponse.json({ message: "Order created" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
