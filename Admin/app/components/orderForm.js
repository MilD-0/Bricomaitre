import { useState } from "react";

export default function OrderForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [state, setState] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [phoneNumber1, setPhoneNumber1] = useState("");
  const [phoneNumber2, setPhoneNumber2] = useState("");

  async function saveOrder(ev) {
    ev.preventDefault();
    const data = {
      firstName,
      lastName,
      state,
      homeAddress,
      emailAddress,
      phoneNumber1,
      phoneNumber2,
      productId,
    };
    await axios.post("/api/orders", data);
    // Handle success or error response
  }

  return (
    <form onSubmit={saveOrder}>
      <label>
        First Name:
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </label>
      <label>
        Last Name:
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </label>
      <label>
        State:
        <input
          type="text"
          value={state}
          onChange={(e) => setState(e.target.value)}
        />
      </label>
      <label>
        Home Address:
        <input
          type="text"
          value={homeAddress}
          onChange={(e) => setHomeAddress(e.target.value)}
        />
      </label>
      <label>
        Email Address:
        <input
          type="email"
          value={emailAddress}
          onChange={(e) => setEmailAddress(e.target.value)}
        />
      </label>
      <label>
        Phone Number 1:
        <input
          type="tel"
          value={phoneNumber1}
          onChange={(e) => setPhoneNumber1(e.target.value)}
        />
      </label>
      <label>
        Phone Number 2:
        <input
          type="tel"
          value={phoneNumber2}
          onChange={(e) => setPhoneNumber2(e.target.value)}
        />
      </label>
      <button type="submit">Submit</button>
    </form>
  );
}