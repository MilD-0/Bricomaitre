"use client";
import { useSession } from "next-auth/react";
import Layout from "./components/layout";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function Home() {
  const session = useSession();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [productSales, setProductSales] = useState({});
  const [totalProductsSold, setTotalProductsSold] = useState(0);
  const [dateFilter, setDateFilter] = useState("all");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState("");

  useEffect(() => {
    axios.get("/api/orders").then((response) => {
      setOrders(response.data);
    });
    axios.get("/api/products").then((response) => {
      setProducts(response.data);
    });
  }, []);

  useEffect(() => {
    if (orders.length > 0 && products.length > 0) {
      calculateSales(orders);
    }
  }, [orders, products, dateFilter, startDate, endDate]);

  const calculateSales = (orders) => {
    let totalProductsSold = 0;
    const productSales = {};
    const filteredOrders = filterOrdersByDate(
      orders,
      dateFilter,
      startDate,
      endDate
    );

    filteredOrders.forEach((order) => {
      if (
        order?.confirmed === "dispatched" ||
        order?.confirmed === "delivered" ||
        order?.confirmed === "complete"
      ) {
        order.cartProducts.forEach((productId) => {
          totalProductsSold++;
          if (!productSales[productId]) {
            productSales[productId] = 0;
          }
          productSales[productId]++;
        });
      }
    });
    setTotalProductsSold(totalProductsSold);
    setProductSales(productSales);
  };

  const filterOrdersByDate = (orders, filter, startDate, endDate) => {
    const now = new Date();
    return orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      switch (filter) {
        case "lastWeek":
          const lastWeek = new Date(now);
          lastWeek.setDate(now.getDate() - 7);
          return orderDate >= lastWeek && orderDate <= now;
        case "lastMonth":
          const lastMonth = new Date(now);
          lastMonth.setMonth(now.getMonth() - 1);
          return orderDate >= lastMonth && orderDate <= now;
        case "custom":
          if (startDate && endDate) {
            return orderDate >= startDate && orderDate <= endDate;
          }
          return true;
        case "all":
        default:
          return true;
      }
    });
  };

  const calculateDailySales = (orders, productId) => {
    const dailySales = {};
    orders.forEach((order) => {
      if (
        order?.confirmed === "dispatched" ||
        order?.confirmed === "delivered" ||
        order?.confirmed === "complete"
      ) {
        order.cartProducts.forEach((id) => {
          if (id === productId) {
            const date = new Date(order.createdAt).toLocaleDateString();
            if (!dailySales[date]) {
              dailySales[date] = 0;
            }
            dailySales[date]++;
          }
        });
      }
    });
    return dailySales;
  };

  const productIdToTitle = products.reduce((acc, product) => {
    acc[product._id] = product.title;
    return acc;
  }, {});

  const truncateTitle = (title, maxLength = 20) => {
    if (title?.length > maxLength) {
      return title.substring(0, maxLength) + "...";
    }
    return title;
  };

  const sortedProductSales = Object.entries(productSales).sort(
    (a, b) => b[1] - a[1]
  );

  const chartData = {
    labels: sortedProductSales.map(([productId]) =>
      truncateTitle(productIdToTitle[productId])
    ),
    datasets: [
      {
        label: "Products Sold",
        data: sortedProductSales.map(([, quantity]) => quantity),
        backgroundColor: "rgba(75, 192, 192, 0.6)",
        borderColor: "rgba(75, 192, 192, 1)",
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top", display: false },
      title: { display: true, text: "Product Sales" },
      tooltip: {
        callbacks: {
          label: function (context) {
            const productId = sortedProductSales[context.dataIndex][0];
            const fullTitle = productIdToTitle[productId];
            return `${fullTitle}: ${context.raw}`;
          },
        },
      },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const productId = sortedProductSales[index][0];
        setSelectedProduct(productId);
      }
    },
  };

  const dailySales = selectedProduct
    ? calculateDailySales(orders, selectedProduct)
    : {};
  const dailySalesData = {
    labels: Object.keys(dailySales),
    datasets: [
      {
        label: "Ventes Quotidiennes",
        data: Object.values(dailySales),
        backgroundColor: "rgba(153, 102, 255, 0.6)",
        borderColor: "rgba(153, 102, 255, 1)",
        borderWidth: 1,
      },
    ],
  };

  return (
    <Layout>
      <h2 className="text-emerald-600 font-roboto text-2xl">
        Bienvenue, {session?.user?.name}
      </h2>
      <div>
        <label htmlFor="dateFilter">Filtrer par Date : </label>
        <select
          id="dateFilter"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        >
          <option value="all">Tout le Temps</option>
          <option value="lastWeek">La Semaine Dernière</option>
          <option value="lastMonth">Le Mois Dernier</option>
          <option value="custom">Plage Personnalisée</option>
        </select>
      </div>
      {dateFilter === "custom" && (
        <div>
          <label>Date de Début : </label>
          <DatePicker
            selected={startDate}
            onChange={(date) => setStartDate(date)}
            selectsStart
            startDate={startDate}
            endDate={endDate}
          />
          <label>Date de Fin : </label>
          <DatePicker
            selected={endDate}
            onChange={(date) => setEndDate(date)}
            selectsEnd
            startDate={startDate}
            endDate={endDate}
            minDate={startDate}
          />
        </div>
      )}
      <div>
        <h3>Total des Produits Vendus : {totalProductsSold}</h3>
      </div>
      <Bar data={chartData} options={options} />
      {selectedProduct && (
        <Bar
          data={dailySalesData}
          options={{
            responsive: true,
            plugins: {
              legend: { position: "top", display: false },
              title: {
                display: true,
                text: `Ventes Quotidiennes pour ${productIdToTitle[selectedProduct]}`,
              },
            },
          }}
        />
      )}
    </Layout>
  );
}
