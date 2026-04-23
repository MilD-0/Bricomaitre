"use client";
import axios from "axios";
import { useEffect, useState, useCallback, useMemo } from "react";
import Swal from "sweetalert2";
import Link from "next/link";
import { calculateDeliveryPrice } from "../components/Prices";
import { calculateDeliveryPrice2 } from "../components/Prices";
import { communesData } from "../components/communes";
import { getCodeFromState } from "../components/Prices";
import Layout from "../components/layout";
import {
  FaSearch,
  FaEdit,
  FaTrash,
  FaPhone,
  FaCopy,
  FaEye,
  FaList,
  FaTh,
  FaBox,
  FaMapMarkerAlt,
  FaUser,
  FaCalendar,
  FaCheck,
  FaShippingFast,
  FaBoxOpen,
  FaClock,
  FaClipboardCheck,
  FaPhoneSlash,
  FaClipboard,
  FaSync,
  FaCloud,
  FaSpinner,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimes,
  FaMoneyBillWave,
  FaUserCheck, FaHistory,FaSave,FaPlus,FaExpand
} from "react-icons/fa";
import { animated, useSpring } from "@react-spring/web";
import ReactSelect from "react-select";
const ProductEditorPopup = ({
  isOpen,
  onClose,
  order,
  allProducts,
  onSave
}) => {
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (order && order.cartProducts) {
      setSelectedProducts(order.cartProducts);
    }
  }, [order]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredProducts([]);
      return;
    }

    const filtered = allProducts.filter(product =>
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedProducts.includes(product._id)
    ).slice(0, 5);

    setFilteredProducts(filtered);
  }, [searchQuery, allProducts, selectedProducts]);

  const handleAddProduct = (productId) => {
    setSelectedProducts(prev => [...prev, productId]);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleRemoveProduct = (productId) => {
    setSelectedProducts(prev => prev.filter(id => id !== productId));
  };

  const handleSave = () => {
    onSave(order._id, selectedProducts);
    onClose();
  };

  const getProduct = (productId) => {
    return allProducts.find(p => p._id === productId);
  };

  const productCounts = selectedProducts.reduce((acc, productId) => {
    acc[productId] = (acc[productId] || 0) + 1;
    return acc;
  }, {});

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-6 rounded-t-lg">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <FaBox size={24} />
                Modifier les produits
              </h2>
              <p className="text-emerald-100 text-sm mt-1">
                {order?.firstName} {order?.lastName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-emerald-800 rounded-full p-2 transition-colors"
            >
              <FaTimes size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rechercher un produit
            </label>
            <div className="relative">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Rechercher par nom de produit..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              {showSuggestions && filteredProducts.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {filteredProducts.map(product => (
                    <button
                      key={product._id}
                      onClick={() => handleAddProduct(product._id)}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors flex items-center gap-3 border-b last:border-b-0"
                    >
                      {product.images && product.images[0] && (
                        <img
                          src={product.images[0]}
                          alt={product.title}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{product.title}</p>
                        <p className="text-sm text-emerald-600 font-semibold">
                          {product.price?.toLocaleString()} DA
                        </p>
                      </div>
                      <FaPlus className="text-emerald-600" size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Produits sélectionnés ({selectedProducts.length})
            </h3>

            {selectedProducts.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <FaBox className="mx-auto text-gray-400 mb-3" size={48} />
                <p className="text-gray-500">Aucun produit sélectionné</p>
                <p className="text-sm text-gray-400 mt-1">
                  Recherchez et ajoutez des produits ci-dessus
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(productCounts).map(([productId, quantity]) => {
                  const product = getProduct(productId);
                  if (!product) return null;

                  return (
                    <div
                      key={productId}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {product.images && product.images[0] && (
                          <img
                            src={product.images[0]}
                            alt={product.title}
                            className="w-16 h-16 object-cover rounded"
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{product.title}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm text-emerald-600 font-semibold">
                              {product.price?.toLocaleString()} DA
                            </span>
                            {quantity > 1 && (
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-semibold">
                                ×{quantity}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {quantity > 1 && (
                          <button
                            onClick={() => {
                              const index = selectedProducts.indexOf(productId);
                              if (index > -1) {
                                const newProducts = [...selectedProducts];
                                newProducts.splice(index, 1);
                                setSelectedProducts(newProducts);
                              }
                            }}
                            className="text-orange-600 hover:text-orange-800 px-3 py-1 rounded hover:bg-orange-50 transition-colors text-sm font-medium"
                            title="Retirer une unité"
                          >
                            -1
                          </button>
                        )}
                        <button
                          onClick={() => handleAddProduct(productId)}
                          className="text-emerald-600 hover:text-emerald-800 px-3 py-1 rounded hover:bg-emerald-50 transition-colors text-sm font-medium"
                          title="Ajouter une unité"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => handleRemoveProduct(productId)}
                          className="text-red-600 hover:text-red-800 p-2 rounded hover:bg-red-50 transition-colors"
                          title="Supprimer toutes les unités"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedProducts.length > 0 && (
            <div className="mt-6 bg-emerald-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total produits:</span>
                <span className="text-2xl font-bold text-emerald-600">
                  {Object.entries(productCounts).reduce((total, [productId, quantity]) => {
                    const product = getProduct(productId);
                    return total + (product?.price || 0) * quantity;
                  }, 0).toLocaleString()} DA
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-6 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium flex items-center gap-2"
          >
            <FaSave size={14} />
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};
const EditablePhone = ({ order, phoneField, updateOrderField }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [phoneValue, setPhoneValue] = useState(String(order[phoneField] || ''));


  useEffect(() => {
    setPhoneValue(String(order[phoneField] || ''));
  }, [order[phoneField]]);

  const handleSave = async () => {
   const cleanPhone = String(phoneValue).replace(/\D/g, '').replace(/^0+/, '');

    if (cleanPhone.length >= 9 && cleanPhone.length <= 10) {
      await updateOrderField(order, phoneField, parseInt(cleanPhone, 10));
      setIsEditing(false);
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Numéro invalide',
        text: 'Le numéro doit contenir 9 ou 10 chiffres',
        timer: 2000,
        showConfirmButton: false
      });
    }
  };

  const handleCancel = () => {
    setPhoneValue(String(order[phoneField] || ''));
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 bg-white rounded px-3 py-2 border-2 border-blue-300">
        <FaPhone className="text-emerald-600" size={14} />
        <input
          type="text"
          value={phoneValue}
          onChange={(e) => setPhoneValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder="0XXXXXXXXX"
          className="flex-1 text-sm font-medium border-none outline-none bg-transparent"
          autoFocus
          maxLength={10}
        />
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-50"
            title="Sauvegarder"
          >
            <FaCheck size={12} />
          </button>
          <button
            onClick={handleCancel}
            className="text-red-600 hover:text-red-800 transition-colors p-1 rounded hover:bg-red-50"
            title="Annuler"
          >
            <FaTimes size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-white rounded px-3 py-2 group">
      <FaPhone className="text-emerald-600" size={14} />
      <span className="text-sm font-medium flex-1">
        0{order[phoneField]}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => setIsEditing(true)}
          className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50 opacity-0 group-hover:opacity-100"
          title="Modifier le numéro"
        >
          <FaEdit size={12} />
        </button>
        <button
          onClick={() => {
            const fullName = `${order.firstName || ''} ${order.lastName || ''}`.trim() || 'Client';
            navigator.clipboard.writeText(fullName);
          }}
          className="text-emerald-600 hover:text-emerald-800 transition-colors p-1 rounded hover:bg-emerald-50"
          title="Copier le nom"
        >
          <FaCopy size={12} />
        </button>
        <a
          href={`tel:0${order[phoneField]}`}
          className="text-emerald-600 hover:text-emerald-800 transition-colors p-1 rounded hover:bg-emerald-50"
          title="Appeler"
        >
          <FaPhone size={12} />
        </a>
      </div>
    </div>
  );
};
const OrderSignature = ({ order }) => {
  if (!order.confirmedBy && !order.confirmedByName) {
    return null;
  }

  return (
    <div className="text-xs space-y-1 bg-emerald-50 rounded px-2 py-1">
      <div className="flex items-center gap-1 text-gray-700">
        <FaUserCheck className="text-emerald-600" size={10} />
        <span className="font-medium">
          {order.confirmedByName || order.confirmedBy}
        </span>
      </div>
      {order.confirmedAt && (
        <div className="flex items-center gap-1 text-gray-500">
          <span className="text-[10px]">
            {new Date(order.confirmedAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      )}
    </div>
  );
};


const EcotrackStatusBadge = ({ order, onRefresh }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Map ECOTRACK status keys to readable French labels
  const getStatusLabel = (status) => {
    const statusMap = {
      'en_attente': 'En attente',
      'prete_a_expedier': 'Prête à expédier',
      'ramassee': 'Ramassée',
      'en_transit': 'En transit',
      'centre_de_tri': 'Au centre de tri',
      'en_livraison': 'En livraison',
      'tentative_livraison': 'Tentative de livraison',
      'livree': 'Livrée',
      'reportee': 'Reportée',
      'retournee': 'Retournée',
      'retournee_expediteur': 'Retournée expéditeur',
      'annulee': 'Annulée',
      'payé_et_archivé': 'Payé et archivé',
    };
    return statusMap[status] || status;
  };





  const getEcotrackStatusColor = (status) => {
    if (!status) return 'bg-gray-100 text-gray-800 border-gray-300';

    const statusLower = status.toLowerCase().replace(/ /g, '_');
    const colors = {
      'en_attente': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'prete_a_expedier': 'bg-cyan-100 text-cyan-800 border-cyan-300',
      'ramassee': 'bg-blue-100 text-blue-800 border-blue-300',
      'en_transit': 'bg-indigo-100 text-indigo-800 border-indigo-300',
      'centre_de_tri': 'bg-sky-100 text-sky-800 border-sky-300',
      'en_livraison': 'bg-purple-100 text-purple-800 border-purple-300',
      'tentative_livraison': 'bg-orange-100 text-orange-800 border-orange-300',
      'livree': 'bg-green-100 text-green-800 border-green-300',
      'reportee': 'bg-orange-100 text-orange-800 border-orange-300',
      'retournee': 'bg-red-100 text-red-800 border-red-300',
      'retournee_expediteur': 'bg-red-100 text-red-800 border-red-300',
      'annulee': 'bg-gray-100 text-gray-800 border-gray-300',
      'payé_et_archivé': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    };

    return colors[statusLower] || 'bg-gray-100 text-gray-800 border-gray-300';
  };





  const handleRefresh = async () => {
    if (!order.ecotrackTrackingNumber) return;

    setIsRefreshing(true);
    try {
      await onRefresh(order._id);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!order.ecotrackTrackingNumber && !order.ecotrackTracking) {
    return (
      <div className="text-xs text-gray-400 italic flex items-center gap-1">
        <FaCloud size={10} className="opacity-50" />
        Non synchronisé
      </div>
    );
  }

  const displayStatus = getStatusLabel(order.ecotrackCurrentStatus || order.ecotrackStatus);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className={`text-xs font-medium border rounded-full px-3 py-1 ${getEcotrackStatusColor(order.ecotrackCurrentStatus || order.ecotrackStatus)}`}>
          {displayStatus || 'N/A'}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50 disabled:opacity-50"
          title="Rafraîchir le statut depuis ECOTRACK"
        >
          <FaSync className={isRefreshing ? 'animate-spin' : ''} size={11} />
        </button>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-gray-500">
        <span title="Numéro de suivi">📦 {order.ecotrackTrackingNumber || order.ecotrackTracking}</span>
      </div>
      {order.ecotrackLastSync && (
        <div className="text-[9px] text-gray-400">
          Sync: {new Date(order.ecotrackLastSync).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      )}
    </div>
  );
};
const ECOTRACK_CONFIG = {
  baseURL: "https://delivromail.ecotrack.dz/api/v1",
  token: process.env.ECOTRACK_API_TOKEN ?? "",
  rateLimits: {
    perMinute: 50,
    perHour: 1500,
    perDay: 15000,
  },
};


const WILAYA_CODES = {
  Adrar: 1,
  Chlef: 2,
  Laghouat: 3,
  "Oum El Bouaghi": 4,
  Batna: 5,
  Béjaïa: 6,
  Biskra: 7,
  Béchar: 8,
  Blida: 9,
  Bouira: 10,
  Tamanrasset: 11,
  Tébessa: 12,
  Tlemcen: 13,
  Tiaret: 14,
  "Tizi Ouzou": 15,
  Alger: 16,
  Djelfa: 17,
  Jijel: 18,
  Sétif: 19,
  Saïda: 20,
  Skikda: 21,
  "Sidi Bel Abbès": 22,
  Annaba: 23,
  Guelma: 24,
  Constantine: 25,
  Médéa: 26,
  Mostaganem: 27,
  "M'Sila": 28,
  Mascara: 29,
  Ouargla: 30,
  Oran: 31,
  "El Bayadh": 32,
  Illizi: 33,
  "Bordj Bou Arréridj": 34,
  Boumerdès: 35,
  "El Tarf": 36,
  Tindouf: 37,
  Tissemsilt: 38,
  "El Oued": 39,
  Khenchela: 40,
  "Souk Ahras": 41,
  Tipaza: 42,
  Mila: 43,
  "Aïn Defla": 44,
  Naâma: 45,
  "Aïn Témouchent": 46,
  Ghardaïa: 47,
  Relizane: 48,
  "El M'Ghair": 49,
  "El Meniaa": 50,
  "Ouled Djellal": 51,
  "Bordj Badji Mokhtar": 52,
  "Béni Abbès": 53,
  Timimoun: 54,
  Touggourt: 55,
  Djanet: 56,
  "In Salah": 57,
  "In Guezzam": 58,
};


class RateLimiter {
  constructor() {
    this.requests = {
      minute: [],
      hour: [],
      day: [],
    };
  }

  canMakeRequest() {
    const now = Date.now();

    this.requests.minute = this.requests.minute.filter(
      (time) => now - time < 60000
    );
    this.requests.hour = this.requests.hour.filter(
      (time) => now - time < 3600000
    );
    this.requests.day = this.requests.day.filter(
      (time) => now - time < 86400000
    );


    return (
      this.requests.minute.length < ECOTRACK_CONFIG.rateLimits.perMinute &&
      this.requests.hour.length < ECOTRACK_CONFIG.rateLimits.perHour &&
      this.requests.day.length < ECOTRACK_CONFIG.rateLimits.perDay
    );
  }

  recordRequest() {
    const now = Date.now();
    this.requests.minute.push(now);
    this.requests.hour.push(now);
    this.requests.day.push(now);
  }

  getWaitTime() {
    const now = Date.now();

    if (this.requests.minute.length >= ECOTRACK_CONFIG.rateLimits.perMinute) {
      return 60000 - (now - this.requests.minute[0]);
    }
    if (this.requests.hour.length >= ECOTRACK_CONFIG.rateLimits.perHour) {
      return 3600000 - (now - this.requests.hour[0]);
    }
    if (this.requests.day.length >= ECOTRACK_CONFIG.rateLimits.perDay) {
      return 86400000 - (now - this.requests.day[0]);
    }

    return 0;
  }
}


const rateLimiter = new RateLimiter();


function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function Orders() {
  const [copied, setCopied] = useState({});
  const [orderNotes, setOrderNotes] = useState({});
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [secondaryIds, setSecondaryIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("table");
  const [productPreview, setProductPreview] = useState(null);
  const [availableCommunes, setAvailableCommunes] = useState([]);


  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncResults, setSyncResults] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);


  const [nameSearch, setNameSearch] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [filter, setFilter] = useState({ confirmed: "" });
const [editingOrder, setEditingOrder] = useState(null);

  const debouncedNameSearch = useDebounce(nameSearch, 300);
  const debouncedPhoneSearch = useDebounce(phoneSearch, 300);
  const debouncedCitySearch = useDebounce(citySearch, 300);


  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalCount: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [viewAll, setViewAll] = useState(false);

  const [itemsPerPage] = viewAll ? [200] : [10];


  const [sortField, setSortField] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");


  const [selectedOrders, setSelectedOrders] = useState([]);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
const [nextSyncTime, setNextSyncTime] = useState(null);
const [autoSyncStatus, setAutoSyncStatus] = useState('idle'); // idle, syncing, success, error


  const fadeIn = useSpring({
    opacity: 1,
    from: { opacity: 0 },
    config: { duration: 300 },
  });


  const statusOptions = useMemo(
    () => [
      {
        value: "nocon",
        label: "Pas contacté",
        color: "bg-gray-100 text-gray-800 border-gray-300",
      },
      {
        value: "no2",
        label: "Sans réponse",
        color: "bg-yellow-100 text-yellow-800 border-yellow-300",
      },
      {
        value: "no3",
        label: "Sans réponse 2",
        color: "bg-yellow-200 text-yellow-900 border-yellow-400",
      },
      {
        value: "no4",
        label: "Sans réponse 3",
        color: "bg-yellow-300 text-yellow-950 border-yellow-500",
      },
      {
        value: "yes",
        label: "Confirmée",
        color: "bg-green-100 text-green-800 border-green-300",
      },
      {
        value: "dispatched",
        label: "Expédié",
        color: "bg-blue-100 text-blue-800 border-blue-300",
      },
      {
        value: "delivered",
        label: "Livrée",
        color: "bg-emerald-100 text-emerald-800 border-emerald-300",
      },
      {
        value: "delayed",
        label: "Reportée",
        color: "bg-orange-100 text-orange-800 border-orange-300",
      },
      {
        value: "complete",
        label: "Complétée",
        color: "bg-purple-100 text-purple-800 border-purple-300",
      },
      {
        value: "cancelled",
        label: "Annulée",
        color: "bg-red-100 text-red-800 border-red-300",
      },
    ],
    []
  );
  const fetchOrders = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: itemsPerPage.toString(),
          sortField,
          sortOrder,
        });


        if (debouncedNameSearch)
          params.append("nameSearch", debouncedNameSearch);
        if (debouncedPhoneSearch)
          params.append("phoneSearch", debouncedPhoneSearch);
        if (debouncedCitySearch)
          params.append("citySearch", debouncedCitySearch);
        if (filter.confirmed) params.append("statusFilter", filter.confirmed);

        const response = await axios.get(`/api/orders?${params.toString()}`);
        setOrders(response.data.orders);
        setPagination(response.data.pagination);
      } catch (error) {
        console.error("Error fetching orders:", error);
        Swal.fire({
          icon: "error",
          title: "Erreur",
          text: "Impossible de charger les commandes",
        });
      }
      setLoading(false);
    },
    [
      itemsPerPage,
      sortField,
      sortOrder,
      debouncedNameSearch,
      debouncedPhoneSearch,
      debouncedCitySearch,
      filter.confirmed,
      viewAll,
    ]
  );

  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get("/api/products");
      setProducts(response.data);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  }, []);
const fetchSecondaryIds = useCallback(async () => {
  try {
    const res = await axios.get("/api/secondary-stock/list");
    const ids = new Set(res.data.map(item => String(item.productId)));
    setSecondaryIds(ids);
  } catch (err) {
    console.error("Error fetching secondary stock ids:", err);
  }
}, []);

const handleSaveProducts = useCallback(async (orderId, newProducts) => {
  try {
    await axios.put(`/api/orders?id=${orderId}`, {
      cartProducts: newProducts
    });

    await fetchOrders(pagination.currentPage);

    Swal.fire({
      icon: 'success',
      title: 'Produits mis à jour',
      text: `${newProducts.length} produit(s) enregistré(s)`,
      timer: 2000,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error('Error updating products:', error);
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: 'Impossible de mettre à jour les produits',
    });
  }
}, [fetchOrders, pagination.currentPage]);

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

useEffect(() => {
  fetchProducts();
  fetchSecondaryIds();
}, [fetchProducts, fetchSecondaryIds]);

const hasSecondary = useCallback((id) => {
  if (!id) return false;
  return secondaryIds.has(String(id));
}, [secondaryIds]);
  useEffect(() => {
    const initialNotes = orders.reduce((acc, order) => {
      acc[order._id] = order.note || "";
      return acc;
    }, {});
    setOrderNotes(initialNotes);
  }, [orders]);

  const deleteOrder = useCallback(
    (order) => {
      const fullName =
        `${order.firstName || ""} ${order.lastName || ""}`.trim() || "Client";
      Swal.fire({
        title: "Confirmation",
        text: `Supprimer la commande de ${fullName}?`,
        showCancelButton: true,
        cancelButtonText: "Annuler",
        confirmButtonText: "Supprimer",
        confirmButtonColor: "#d55",
        background: "#e5e7eb",
        reverseButtons: true,
        icon: "question",
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            await axios.delete(`/api/orders?id=${order._id}`);
            await fetchOrders(pagination.currentPage);
            Swal.fire({
              icon: "success",
              title: "Commande supprimée",
              timer: 1500,
              showConfirmButton: false,
            });
          } catch (error) {
            Swal.fire({
              icon: "error",
              title: "Erreur",
              text: "Impossible de supprimer la commande",
            });
          }
        }
      });
    },
    [fetchOrders, pagination.currentPage]
  );


  function getWilayaCode(stateName) {
    const normalizedState = stateName.trim();
    return WILAYA_CODES[normalizedState] || 16;  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }


  function transformOrderToEcotrack(order) {
    let fullName = "";
    if (order.firstName && order.lastName) {
      fullName = `${order.firstName} ${order.lastName}`.trim();
    } else if (order.lastName) {
      fullName = order.lastName.trim();
    } else if (order.firstName) {
      fullName = order.firstName.trim();
    } else {
      fullName = "Client";
    }

     const subtotal = calculateSubtotal(order);
    const deliveryPrice = order.del_pr || calculateDeliveryPrice(order);
    const deliveryPrice2 = calculateDeliveryPrice2(order);
    const totalAmount = subtotal + deliveryPrice;
    const totalAmount2 = subtotal + deliveryPrice2;

    return {
      reference: order._id.toString(),
      nom_client: order.lastName ? order.lastName.trim() : "Client",
      telephone: "0" + order.phoneNumber1.toString(),
      adresse: order.homeAddress || "Adresse non fournie",
      commune: order.city || "Commune non fournie",
      code_wilaya: getCodeFromState(order.state),
      montant: totalAmount2,
      remarque: order.note || "",
      produit: order.cartProducts
        .map((cartProductId) => {
          const product = products.find((p) => p._id === cartProductId);
          return product ? product.title : "Produit inconnu";
        })
        .join(", "),
      type: 1,
      stop_desk: order.delivery === "office" ? 1 : 0,      fragile: 0,
    };
  }

 const [migrationInProgress, setMigrationInProgress] = useState(false);

const runEcotrackMigration = useCallback(async () => {
  const result = await Swal.fire({
    title: "Migration ECOTRACK",
    html: `
      <div class="text-left">
        <p class="mb-3">Cette opération va initialiser les numéros de suivi ECOTRACK pour toutes les commandes confirmées.</p>
        <p class="mb-3 text-sm text-gray-600">
          <strong>Critères:</strong><br>
          • Commandes confirmées (pas "Pas contacté", "Sans réponse", "Annulée", ou "Complétée")<br>
          • Sans numéro de suivi ECOTRACK existant
        </p>
        <p class="text-sm text-orange-600">⚠️ Cette opération peut prendre quelques secondes.</p>
      </div>
    `,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Lancer la migration",
    cancelButtonText: "Annuler",
    confirmButtonColor: "#059669",
  });

  if (!result.isConfirmed) return;

  setMigrationInProgress(true);

  try {
    Swal.fire({
      title: 'Migration en cours...',
      html: 'Initialisation des numéros de suivi ECOTRACK',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const response = await axios.post('/api/migrate-ecotrack');

    if (response.data.success) {
      const stats = response.data.results.statistics;

      await Swal.fire({
        icon: 'success',
        title: 'Migration réussie !',
        html: `
          <div class="text-left space-y-2">
            <p class="mb-3">✅ Migration terminée avec succès</p>
            <div class="bg-gray-50 p-3 rounded">
              <p><strong>Initialisés:</strong> ${response.data.results.initialized} commandes</p>
              <p><strong>Normalisés:</strong> ${response.data.results.normalized} commandes</p>
            </div>
            <div class="bg-blue-50 p-3 rounded mt-3">
              <p class="font-semibold mb-2">Statistiques:</p>
              <p><strong>Total:</strong> ${stats.total} commandes</p>
              <p><strong>Avec suivi:</strong> ${stats.withTracking} commandes</p>
              <p><strong>Sans suivi:</strong> ${stats.withoutTracking} commandes</p>
              ${stats.byStatus && stats.byStatus.length > 0 ? `
                <div class="mt-2">
                  <p class="font-semibold">Par statut:</p>
                  ${stats.byStatus.map(s => `<p class="text-sm">• ${s._id}: ${s.count}</p>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        `,
        confirmButtonColor: '#059669',
        width: 600,
      });

      // Refresh orders to show new tracking numbers
      await fetchOrders(pagination.currentPage);
    } else {
      throw new Error(response.data.error || 'Migration failed');
    }
  } catch (error) {
    console.error('Migration error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Erreur de migration',
      text: error.message || 'Impossible de lancer la migration',
    });
  } finally {
    setMigrationInProgress(false);
  }
}, [fetchOrders, pagination.currentPage]);
  async function createEcotrackOrder(orderData) {

    if (!rateLimiter.canMakeRequest()) {
      const waitTime = rateLimiter.getWaitTime();
      console.log(
        `Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`
      );
      await wait(waitTime);
    }

    try {
      const url = new URL(`${ECOTRACK_CONFIG.baseURL}/create/order`);


      Object.keys(orderData).forEach((key) => {
        if (
          orderData[key] !== "" &&
          orderData[key] !== null &&
          orderData[key] !== undefined
        ) {
          url.searchParams.append(key, orderData[key]);
        }
      });

      const response = await axios.post(
        url.toString(),
        {},
        {
          headers: {
            Authorization: `Bearer ${ECOTRACK_CONFIG.token}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      rateLimiter.recordRequest();
      return { success: true, data: response.data };
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers["retry-after"];
        if (retryAfter) {
          console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
          await wait(parseInt(retryAfter) * 1000);
          return createEcotrackOrder(orderData);
        }
      }

      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status,
      };
    }
  }


  const syncSelectedOrdersToEcotrack = useCallback(async () => {
    if (selectedOrders.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Aucune commande sélectionnée",
        text: "Veuillez sélectionner au moins une commande à synchroniser",
        timer: 2000,
        showConfirmButton: false,
      });
      return;
    }


    const result = await Swal.fire({
      title: "Synchroniser avec ECOTRACK",
      text: `Voulez-vous synchroniser ${selectedOrders.length} commande(s) avec ECOTRACK ?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Synchroniser",
      cancelButtonText: "Annuler",
      confirmButtonColor: "#059669",
    });

    if (!result.isConfirmed) return;

    setSyncInProgress(true);
    const results = [];

    try {

      const selectedOrderObjects = orders.filter((order) =>
        selectedOrders.includes(order._id)
      );


      let progressElement;
      const showProgress = (current, total) => {
        const percentage = Math.round((current / total) * 100);

        if (!progressElement) {
          progressElement = document.createElement("div");
          progressElement.className =
            "fixed top-4 right-4 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-w-sm";
          progressElement.innerHTML = `
            <div class="flex items-center gap-3 mb-2">
              <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600"></div>
              <span class="font-semibold text-gray-800">Synchronisation ECOTRACK</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div class="bg-emerald-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
            <div class="text-sm text-gray-600">0 / ${total} commandes</div>
          `;
          document.body.appendChild(progressElement);
        }

        const progressBar = progressElement.querySelector(".bg-emerald-600");
        const progressText = progressElement.querySelector(".text-sm");

        if (progressBar) {
          progressBar.style.width = `${percentage}%`;
        }
        if (progressText) {
          progressText.textContent = `${current} / ${total} commandes`;
        }
      };

      for (let i = 0; i < selectedOrderObjects.length; i++) {
        const order = selectedOrderObjects[i];
        showProgress(i, selectedOrderObjects.length);

        try {
         const ecotrackData = transformOrderToEcotrack(order);
const result = await createEcotrackOrder(ecotrackData);

if (result.success) {
  const trackingNumber = result.data.tracking || result.data.tracking_number;

  if (trackingNumber) {
    await axios.put(`/api/orders?id=${order._id}`, {
      ecotrackTrackingNumber: trackingNumber,
      ecotrackStatus: 'en_attente',
      ecotrackCurrentStatus: 'en_attente',
      ecotrackLastSync: new Date(),
    });
  }

  results.push({
    orderId: order._id,
    orderName:
      `${order.firstName || ""} ${order.lastName || ""}`.trim() ||
      "Client",
    success: result.success,
    data: result.data,
    trackingNumber: trackingNumber,
  });
}

else {
  results.push({
    orderId: order._id,
    orderName:
      `${order.firstName || ""} ${order.lastName || ""}`.trim() ||
      "Client",
    success: false,
    error: result.error,
  });
}




          if (i < selectedOrderObjects.length - 1) {
            await wait(500);
          }
        } catch (error) {
          results.push({
            orderId: order._id,
            orderName:
              `${order.firstName || ""} ${order.lastName || ""}`.trim() ||
              "Client",
            success: false,
            error: error.message,
          });
        }
      }

      showProgress(selectedOrderObjects.length, selectedOrderObjects.length);


      setTimeout(() => {
        if (progressElement && progressElement.parentNode) {
          progressElement.parentNode.removeChild(progressElement);
        }
      }, 1000);


      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      setSyncResults({
        successful,
        failed,
        total: results.length,
        results: results,
      });

      setLastSyncTime(new Date());
      setSelectedOrders([]);


      if (failed === 0) {
        Swal.fire({
          icon: "success",
          title: "Synchronisation réussie !",
          text: `${successful} commande(s) synchronisée(s) avec succès`,
          timer: 3000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire({
          title: "Synchronisation terminée",
          html: `
            <div class="text-left">
              <p class="mb-2"><span class="text-green-600 font-semibold">${successful}</span> commande(s) synchronisée(s)</p>
              <p class="mb-3"><span class="text-red-600 font-semibold">${failed}</span> échec(s)</p>
              <details class="text-sm">
                <summary class="cursor-pointer font-medium">Voir les détails</summary>
                <div class="mt-2 max-h-48 overflow-y-auto">
                  ${results
                    .filter((r) => !r.success)
                    .map(
                      (r) =>
                        `<p class="text-red-600">• ${r.orderName}: ${r.error}</p>`
                    )
                    .join("")}
                </div>
              </details>
            </div>
          `,
          icon: failed > successful ? "warning" : "success",
          confirmButtonColor: "#059669",
        });
      }
    } catch (error) {
      console.error("Error in sync process:", error);
      Swal.fire({
        icon: "error",
        title: "Erreur de synchronisation",
        text: error.message,
      });
    }

    setSyncInProgress(false);
  }, [selectedOrders, orders]);


  const syncConfirmedOrders = useCallback(async () => {
    const confirmedOrders = orders.filter((order) => order.confirmed === "yes");

    if (confirmedOrders.length === 0) {
      Swal.fire({
        icon: "info",
        title: "Aucune commande confirmée",
        text: "Il n'y a pas de commandes confirmées à synchroniser",
        timer: 2000,
        showConfirmButton: false,
      });
      return;
    }


    const result = await Swal.fire({
      title: "Synchroniser les commandes confirmées",
      text: `Voulez-vous synchroniser ${confirmedOrders.length} commande(s) confirmée(s) avec ECOTRACK ? Elles seront automatiquement marquées comme expédiées.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Synchroniser",
      cancelButtonText: "Annuler",
      confirmButtonColor: "#059669",
    });

    if (!result.isConfirmed) return;

    setSyncInProgress(true);
    const results = [];

    try {

      let progressElement;
      const showProgress = (current, total) => {
        const percentage = Math.round((current / total) * 100);

        if (!progressElement) {
          progressElement = document.createElement("div");
          progressElement.className =
            "fixed top-4 right-4 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-w-sm";
          progressElement.innerHTML = `
          <div class="flex items-center gap-3 mb-2">
            <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600"></div>
            <span class="font-semibold text-gray-800">Synchronisation ECOTRACK</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div class="bg-emerald-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
          <div class="text-sm text-gray-600">0 / ${total} commandes</div>
        `;
          document.body.appendChild(progressElement);
        }

        const progressBar = progressElement.querySelector(".bg-emerald-600");
        const progressText = progressElement.querySelector(".text-sm");

        if (progressBar) {
          progressBar.style.width = `${percentage}%`;
        }
        if (progressText) {
          progressText.textContent = `${current} / ${total} commandes`;
        }
      };


      for (let i = 0; i < confirmedOrders.length; i++) {
        const order = confirmedOrders[i];
        showProgress(i, confirmedOrders.length);

        try {
          const ecotrackData = transformOrderToEcotrack(order);
          const result = await createEcotrackOrder(ecotrackData);

          results.push({
            orderId: order._id,
            orderName:
              `${order.firstName || ""} ${order.lastName || ""}`.trim() ||
              "Client",
            success: result.success,
            data: result.data,
            error: result.error,
            status: result.status,
          });


          if (i < confirmedOrders.length - 1) {
            await wait(500);
          }
        } catch (error) {
          results.push({
            orderId: order._id,
            orderName:
              `${order.firstName || ""} ${order.lastName || ""}`.trim() ||
              "Client",
            success: false,
            error: error.message,
          });
        }
      }

      showProgress(confirmedOrders.length, confirmedOrders.length);


      setTimeout(() => {
        if (progressElement && progressElement.parentNode) {
          progressElement.parentNode.removeChild(progressElement);
        }
      }, 1000);


      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      const successfulOrderIds = results
        .filter((r) => r.success)
        .map((r) => r.orderId);
      const failedResults = results.filter((r) => !r.success);

      setSyncResults({
        successful,
        failed,
        total: results.length,
        results: results,
      });

      setLastSyncTime(new Date());

      if (successfulOrderIds.length > 0) {
        try {
          await axios.patch("/api/orders", {
            orderIds: successfulOrderIds,
            updates: { confirmed: "dispatched" },
          });

          await fetchOrders(pagination.currentPage);
        } catch (error) {
          console.error("Error updating order status:", error);
        }
      }

      if (failed === 0) {
        Swal.fire({
          icon: "success",
          title: "Synchronisation réussie !",
          text: `${successful} commande(s) synchronisée(s) et marquée(s) comme expédiée(s)`,
          timer: 3000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire({
          title:
            failed === confirmedOrders.length
              ? "Synchronisation échouée"
              : "Synchronisation partiellement réussie",
          html: `
          <div class="text-left">
            ${
              successful > 0
                ? `<p class="mb-2"><span class="text-green-600 font-semibold">${successful}</span> commande(s) synchronisée(s) et marquée(s) comme expédiée(s)</p>`
                : ""
            }
            <p class="mb-3"><span class="text-red-600 font-semibold">${failed}</span> échec(s):</p>
            <div class="mt-2 max-h-48 overflow-y-auto text-sm bg-gray-50 rounded p-3">
              ${failedResults
                .map(
                  (r) =>
                    `<p class="text-red-600 mb-1">• <strong>${r.orderName}</strong>: ${r.error}</p>`
                )
                .join("")}
            </div>
          </div>
        `,
          icon: failed === confirmedOrders.length ? "error" : "warning",
          confirmButtonColor: "#059669",
          width: 600,
        });
      }
    } catch (error) {
      console.error("Error in sync process:", error);
      Swal.fire({
        icon: "error",
        title: "Erreur de synchronisation",
        text: error.message,
      });
    }

    setSyncInProgress(false);
  }, [
    orders,
    transformOrderToEcotrack,
    createEcotrackOrder,
    fetchOrders,
    pagination.currentPage,
  ]);

  const productsMap = useMemo(() => {
    return products.reduce((acc, product) => {
      acc[product._id] = product;
      return acc;
    }, {});
  }, [products]);

  const handleCopy = useCallback((order) => {
    const fullName =
      `${order.firstName || ""} ${order.lastName || ""}`.trim() || "Client";
    navigator.clipboard.writeText(fullName);
    setCopied((prevCopied) => ({ ...prevCopied, [order._id]: true }));
    setTimeout(() => {
      setCopied((prevCopied) => ({ ...prevCopied, [order._id]: false }));
    }, 2000);
  }, []);


  const copySelectedOrdersProducts = useCallback(async () => {
    if (selectedOrders.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Aucune commande sélectionnée",
        text: "Veuillez sélectionner au moins une commande",
        timer: 2000,
        showConfirmButton: false,
      });
      return;
    }

    try {
      const selectedOrderObjects = orders.filter((order) =>
        selectedOrders.includes(order._id)
      );

      const productCounts = {};

      selectedOrderObjects.forEach((order) => {
        order.cartProducts.forEach((productId) => {
          productCounts[productId] = (productCounts[productId] || 0) + 1;
        });
      });

      const productsList = Object.entries(productCounts)
        .map(([productId, quantity]) => {
          const product = productsMap[productId];
          if (!product) return null;

          return quantity > 1
            ? `${product.title} (×${quantity})`
            : product.title;
        })
        .filter(Boolean)
        .join("\n");

      if (productsList) {
        await navigator.clipboard.writeText(productsList);

        Swal.fire({
          icon: "success",
          title: "Produits copiés!",
          text: `${
            Object.keys(productCounts).length
          } produit(s) unique(s) copiés dans le presse-papiers`,
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire({
          icon: "warning",
          title: "Aucun produit trouvé",
          text: "Les commandes sélectionnées ne contiennent aucun produit valide",
          timer: 2000,
          showConfirmButton: false,
        });
      }
    } catch (error) {
      console.error("Error copying products:", error);
      Swal.fire({
        icon: "error",
        title: "Erreur",
        text: "Impossible de copier les produits",
      });
    }
  }, [selectedOrders, orders, productsMap]);

  const calculateProfitForSelectedOrders = useCallback(async () => {
    if (selectedOrders.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Aucune commande sélectionnée",
        text: "Veuillez sélectionner au moins une commande pour calculer le profit",
        timer: 2000,
        showConfirmButton: false,
      });
      return;
    }

    try {
      // Show loading indicator
      Swal.fire({
        title: 'Calcul du profit...',
        html: 'Veuillez patienter pendant le calcul du profit',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      // Create a query string with the selected order IDs
      const orderIdsParam = selectedOrders.join(',');
      const response = await axios.get(`/api/profit?orderIds=${orderIdsParam}`);

      if (response.data.success) {
        Swal.close();

        // Show profit result
        Swal.fire({
          icon: "success",
          title: "Profit Calculé",
          html: `
            <div class="text-center">
              <p class="text-2xl font-bold text-emerald-600">${response.data.totalProfit.toFixed(2)} DZD</p>
              <p class="text-gray-600">de profit sur ${response.data.ordersCount} commande(s) sélectionnée(s)</p>
            </div>
          `,
          confirmButtonColor: "#059669",
        });
      } else {
        Swal.close();
        Swal.fire({
          icon: "error",
          title: "Erreur de calcul",
          text: response.data.error || "Impossible de calculer le profit",
        });
      }
    } catch (error) {
      console.error("Error calculating profit:", error);
      Swal.close();
      Swal.fire({
        icon: "error",
        title: "Erreur",
        text: "Une erreur s'est produite lors du calcul du profit",
      });
    }
  }, [selectedOrders, orders]);

  const updateNote = useCallback(
    async (order) => {
      try {
        await axios.put(`/api/orders?id=${order._id}`, {
          note: orderNotes[order._id],
        });

        Swal.fire({
          icon: "success",
          title: "Note mise à jour",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (error) {
        Swal.fire({
          icon: "error",
          title: "Erreur",
          text: "Impossible de mettre à jour la note",
        });
      }
    },
    [orderNotes]
  );
  const getStatusColor = useCallback((status) => {
    const colors = {
      nocon: "bg-gray-100 text-gray-800 border-gray-300",
      no2: "bg-yellow-100 text-yellow-800 border-yellow-300",
      no3: "bg-yellow-200 text-yellow-900 border-yellow-400",
      no4: "bg-yellow-300 text-yellow-950 border-yellow-500",
      yes: "bg-green-100 text-green-800 border-green-300",
      dispatched: "bg-blue-100 text-blue-800 border-blue-300",
      delivered: "bg-emerald-100 text-emerald-800 border-emerald-300",
      delayed: "bg-orange-100 text-orange-800 border-orange-300",
      complete: "bg-purple-100 text-purple-800 border-purple-300",
      cancelled: "bg-red-100 text-red-800 border-red-300",
    };
    return colors[status] || colors["nocon"];
  }, []);

  const calculateOrderDetails = useCallback(
    (order) => {
      const productCounts = {};
      let subtotal = 0;

      order.cartProducts.forEach((productId) => {
        productCounts[productId] = (productCounts[productId] || 0) + 1;
      });

      Object.entries(productCounts).forEach(([productId, quantity]) => {
        const product = productsMap[productId];
        if (product) {
          subtotal += product.price * quantity;
        }
      });

      return { productCounts, subtotal };
    },
    [productsMap]
  );

  const calculateSubtotal = useCallback(
    (order) => {
      return calculateOrderDetails(order).subtotal;
    },
    [calculateOrderDetails]
  );



  const handleFilterChange = useCallback((ev) => {
    const { value } = ev.target;
    setFilter({ confirmed: value });
  }, []);


  const handleNameSearchChange = useCallback((e) => {
    setNameSearch(e.target.value);
  }, []);

  const handlePhoneSearchChange = useCallback((e) => {
    setPhoneSearch(e.target.value);
  }, []);

  const handleCitySearchChange = useCallback((e) => {
    setCitySearch(e.target.value);
  }, []);

  const handlePageChange = useCallback(
    (newPage) => {
      fetchOrders(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [fetchOrders]
  );

  const toggleSort = useCallback(
    (field) => {
      if (sortField === field) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortField(field);
        setSortOrder("asc");
      }
    },
    [sortField, sortOrder]
  );


  const handleSelectAll = useCallback(
    (checked) => {
      if (checked) {
        setSelectedOrders(orders.map((order) => order._id));
      } else {
        setSelectedOrders([]);
      }
    },
    [orders]
  );

  const handleSelectOrder = useCallback((orderId, checked) => {
    if (checked) {
      setSelectedOrders((prev) => [...prev, orderId]);
    } else {
      setSelectedOrders((prev) => prev.filter((id) => id !== orderId));
    }
  }, []);


  const bulkUpdateStatus = useCallback(
    async (status) => {
      if (selectedOrders.length === 0) return;

      try {
        await axios.patch("/api/orders", {
          orderIds: selectedOrders,
          updates: { confirmed: status },
        });

        await fetchOrders(pagination.currentPage);
        setSelectedOrders([]);
        Swal.fire({
          icon: "success",
          title: `${selectedOrders.length} commande(s) mise(s) à jour`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (error) {
        Swal.fire({
          icon: "error",
          title: "Erreur",
          text: "Impossible de mettre à jour les commandes",
        });
      }
    },
    [selectedOrders, fetchOrders, pagination.currentPage]
  );
const refreshEcotrackStatus = useCallback(async (orderIds) => {
  if (!Array.isArray(orderIds)) {
    orderIds = [orderIds];
  }

  // Filter orders that have ECOTRACK tracking numbers
  const ordersWithTracking = orders.filter(order =>
    orderIds.includes(order._id) && order.ecotrackTrackingNumber
  );

  if (ordersWithTracking.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Aucune commande ECOTRACK',
      text: 'Les commandes sélectionnées ne sont pas synchronisées avec ECOTRACK',
      timer: 2000,
      showConfirmButton: false,
    });
    return;
  }

  // Show loading indicator
  Swal.fire({
    title: 'Synchronisation en cours...',
    html: 'Récupération des statuts depuis ECOTRACK',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  try {
    const response = await axios.patch('/api/orders', {
      orderIds: ordersWithTracking.map(o => o._id),
      action: 'refreshEcotrackStatus',
    });

    // ✅ FIX: Update orders state directly instead of refetching
    if (response.data.results) {
      setOrders(prevOrders =>
        prevOrders.map(order => {
          const result = response.data.results.find(r => r.orderId === order._id);
          if (result && result.success) {
            return {
              ...order,
              ecotrackStatus: result.status,
              ecotrackCurrentStatus: result.status,
              ecotrackTrackingNumber: result.trackingNumber,
              ecotrackLastSync: new Date().toISOString(),
            };
          }
          return order;
        })
      );
    }

    const successful = response.data.results.filter(r => r.success).length;
    const failed = response.data.results.filter(r => !r.success).length;

    Swal.close();

    if (failed === 0) {
      Swal.fire({
        icon: 'success',
        title: 'Statuts mis à jour',
        html: `
          <div class="text-left">
            <p class="mb-2">✅ <span class="font-semibold">${successful}</span> statut(s) actualisé(s)</p>
            <p class="text-sm text-gray-600">Données synchronisées depuis ECOTRACK</p>
          </div>
        `,
        timer: 3000,
        showConfirmButton: false,
      });
    } else if (successful > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Synchronisation partielle',
        html: `
          <div class="text-left">
            <p class="mb-2">✅ <span class="text-green-600 font-semibold">${successful}</span> statut(s) actualisé(s)</p>
            <p class="mb-3">⚠️ <span class="text-orange-600 font-semibold">${failed}</span> commande(s) non trouvée(s)</p>


          </div>
        `,
        confirmButtonColor: '#059669',
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Aucune mise à jour',
        html: `
          <div class="text-left">
            <p class="mb-2">❌ Aucune commande trouvée dans ECOTRACK</p>
            <p class="text-sm text-gray-600">Les commandes peuvent être archivées ou créées il y a plus de 90 jours.</p>
          </div>
        `,
        confirmButtonColor: '#059669',
      });
    }
  } catch (error) {
    console.error('Error refreshing ECOTRACK status:', error);
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: 'Impossible de rafraîchir les statuts ECOTRACK',
    });
  }
}, [orders]); // ✅ Add 'orders' to dependencies

// Function to update all Ecotrack statuses for all orders in the system
const refreshAllEcotrackStatuses = useCallback(async () => {
  Swal.fire({
    title: 'Récupération de tous les statuts...',
    html: 'Mise à jour des statuts ECOTRACK pour toutes les commandes',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  try {
    // Call the ecotrack-status API to update statuses for ALL orders that need updates
    const response = await axios.get('/api/ecotrack-status?all=true');

    // Show results
    Swal.close();

    Swal.fire({
      icon: 'success',
      title: 'Mise à jour complète',
      html: `
        <div class="text-left">
          <p class="mb-2">✅ <span class="font-semibold">${response.data.count}</span> commande(s) mises à jour</p>
          <p class="text-sm text-gray-600">Statuts récupérés depuis ECOTRACK</p>
        </div>
      `,
      timer: 3000,
      showConfirmButton: false,
    });

    // Refresh the orders from the server to reflect the new statuses
    await fetchOrders(pagination.currentPage);
  } catch (error) {
    console.error('Error refreshing all ECOTRACK statuses:', error);
    Swal.close();

    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: 'Impossible de rafraîchir tous les statuts ECOTRACK',
    });
  }
}, [fetchOrders, pagination.currentPage]);
useEffect(() => {
  if (!autoSyncEnabled) {
    console.log('Auto-sync is disabled');
    return;
  }

  const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
  let syncTimer;
  let countdownTimer;

  const updateNextSyncTime = () => {
    setNextSyncTime(new Date(Date.now() + SYNC_INTERVAL));
  };

  const autoSyncEcotrackStatuses = async () => {
    try {
      setAutoSyncStatus('syncing');

      // Only sync orders that need tracking
      const ordersToSync = orders.filter(order =>
        order.ecotrackTrackingNumber &&
        !['nocon', 'no2', 'cancelled', 'complete', 'delivered'].includes(order.confirmed)
      );

      if (ordersToSync.length === 0) {
        console.log('No orders need ECOTRACK sync');
        setAutoSyncStatus('idle');
        updateNextSyncTime();
        return;
      }

      console.log(`Auto-syncing ${ordersToSync.length} ECOTRACK orders...`);

      const orderIds = ordersToSync.map(o => o._id);

      const response = await axios.patch('/api/orders', {
        orderIds,
        action: 'refreshEcotrackStatus',
      });

      if (response.data.results) {
        // Update local state with new statuses
        setOrders(prevOrders =>
          prevOrders.map(order => {
            const result = response.data.results.find(r => r.orderId === order._id);
            if (result && result.success) {
              return {
                ...order,
                ecotrackStatus: result.status,
                ecotrackCurrentStatus: result.status,
                ecotrackTrackingNumber: result.trackingNumber,
                ecotrackLastSync: new Date().toISOString(),
              };
            }
            return order;
          })
        );

        const successCount = response.data.results.filter(r => r.success).length;
        console.log(`✅ Auto-sync complete: ${successCount}/${ordersToSync.length} orders updated`);

        setLastSyncTime(new Date());
        setAutoSyncStatus('success');

        // Reset to idle after 3 seconds
        setTimeout(() => setAutoSyncStatus('idle'), 3000);
      }

      updateNextSyncTime();
    } catch (error) {
      console.error('Auto-sync error:', error);
      setAutoSyncStatus('error');

      // Reset to idle after 5 seconds
      setTimeout(() => setAutoSyncStatus('idle'), 5000);
      updateNextSyncTime();
    }
  };

  // Initial sync after 10 seconds
  const initialTimer = setTimeout(() => {
    autoSyncEcotrackStatuses();
  }, 10000);

  // Set up recurring sync
  syncTimer = setInterval(() => {
    autoSyncEcotrackStatuses();
  }, SYNC_INTERVAL);

  // Update next sync time initially
  updateNextSyncTime();

  return () => {
    clearTimeout(initialTimer);
    clearInterval(syncTimer);
    clearInterval(countdownTimer);
  };
}, [orders, autoSyncEnabled]);


 useEffect(() => {
  if (!autoSyncEnabled) {
    console.log('Auto-sync is disabled');
    return;
  }

  const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
  let syncTimer;
  let countdownTimer;

  const updateNextSyncTime = () => {
    setNextSyncTime(new Date(Date.now() + SYNC_INTERVAL));
  };

  const autoSyncEcotrackStatuses = async () => {
    try {
      setAutoSyncStatus('syncing');

      // Only sync orders that need tracking
      const ordersToSync = orders.filter(order =>
        order.ecotrackTrackingNumber &&
        !['nocon', 'no2', 'cancelled', 'complete', 'delivered'].includes(order.confirmed)
      );

      if (ordersToSync.length === 0) {
        console.log('No orders need ECOTRACK sync');
        setAutoSyncStatus('idle');
        updateNextSyncTime();
        return;
      }

      console.log(`Auto-syncing ${ordersToSync.length} ECOTRACK orders...`);

      const orderIds = ordersToSync.map(o => o._id);

      const response = await axios.patch('/api/orders', {
        orderIds,
        action: 'refreshEcotrackStatus',
      });

      if (response.data.results) {
        // Update local state with new statuses
        setOrders(prevOrders =>
          prevOrders.map(order => {
            const result = response.data.results.find(r => r.orderId === order._id);
            if (result && result.success) {
              return {
                ...order,
                ecotrackStatus: result.status,
                ecotrackCurrentStatus: result.status,
                ecotrackTrackingNumber: result.trackingNumber,
                ecotrackLastSync: new Date().toISOString(),
              };
            }
            return order;
          })
        );

        const successCount = response.data.results.filter(r => r.success).length;
        console.log(`✅ Auto-sync complete: ${successCount}/${ordersToSync.length} orders updated`);

        setLastSyncTime(new Date());
        setAutoSyncStatus('success');

        // Reset to idle after 3 seconds
        setTimeout(() => setAutoSyncStatus('idle'), 3000);
      }

      updateNextSyncTime();
    } catch (error) {
      console.error('Auto-sync error:', error);
      setAutoSyncStatus('error');

      // Reset to idle after 5 seconds
      setTimeout(() => setAutoSyncStatus('idle'), 5000);
      updateNextSyncTime();
    }
  };

  // Initial sync after 10 seconds
  const initialTimer = setTimeout(() => {
    autoSyncEcotrackStatuses();
  }, 10000);

  // Set up recurring sync
  syncTimer = setInterval(() => {
    autoSyncEcotrackStatuses();
  }, SYNC_INTERVAL);

  // Update next sync time initially
  updateNextSyncTime();

  return () => {
    clearTimeout(initialTimer);
    clearInterval(syncTimer);
    clearInterval(countdownTimer);
  };
}, [orders, autoSyncEnabled]);
const [countdown, setCountdown] = useState('');
const [showShoppingList, setShowShoppingList] = useState(false);
const [shoppingListOrders, setShoppingListOrders] = useState([]);

const AutoSyncIndicator = () => {


  useEffect(() => {
    if (!nextSyncTime) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = nextSyncTime - now;

      if (diff <= 0) {
        setCountdown('Synchronisation...');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [nextSyncTime]);}

  const getStatusIcon = () => {
    switch (autoSyncStatus) {
      case 'syncing':
        return <FaSpinner className="animate-spin text-blue-600" size={16} />;
      case 'success':
        return <FaCheckCircle className="text-green-600" size={16} />;
      case 'error':
        return <FaExclamationTriangle className="text-red-600" size={16} />;
      default:
        return <FaSync className="text-gray-600" size={16} />;
    }
  };

  const getStatusText = () => {
    switch (autoSyncStatus) {
      case 'syncing':
        return 'Synchronisation en cours...';
      case 'success':
        return 'Synchronisé avec succès';
      case 'error':
        return 'Erreur de synchronisation';
      default:
        return autoSyncEnabled ? `Prochaine sync: ${countdown}` : 'Auto-sync désactivé';
    }
  };


  const showProductPreview = useCallback(
    async (productId, event) => {
      const product = productsMap[productId];
      if (product) {
        setProductPreview({
          product,
          x: event.clientX,
          y: event.clientY,
        });
      }
    },
    [productsMap]
  );

// REPLACE the existing generateShoppingList function in page.js with this one:

  const generateShoppingList = async (orderList) => {
    const productList = [];
    const productQuantities = {};
    const brandGroups = {}; // Track products by brand

    for (const order of orderList) {
      const productCounts = {};

      // Ensure cartProducts exists and is an array before processing
      const cartProducts = order.cartProducts || [];
      if (Array.isArray(cartProducts) && cartProducts.length > 0) {
        cartProducts.forEach(productId => {
          productCounts[productId] = (productCounts[productId] || 0) + 1;
          productQuantities[productId] = (productQuantities[productId] || 0) + 1;
        });
      }

      for (const [productId, quantity] of Object.entries(productCounts)) {
        // Group by brand
        const product = productsMap[productId];
        if (product && product.brand) {
          const brandId = product.brand.toString();
          if (!brandGroups[brandId]) {
            brandGroups[brandId] = {
              brandId: brandId,
              brandName: 'Unknown Brand', // Default name, will be updated
              brandImage: '',
              orders: [],
              products: []
            };
          }

          // Add product info with order note
          const productInfo = {
            id: productId,
            title: product.title || 'Unknown Product',
            quantity: quantity,
            image: product?.images?.[0] || '',
            orderNote: order.note || '' // Attach order note to product
          };

          // Check if product already exists in this brand's products, if so, sum the quantities
          const existingProductIndex = brandGroups[brandId].products.findIndex(p => p.id === productId);
          if (existingProductIndex > -1) {
            brandGroups[brandId].products[existingProductIndex].quantity += quantity;
            // If this product appears in multiple orders with different notes, concatenate them
            if (brandGroups[brandId].products[existingProductIndex].orderNote && order.note &&
                brandGroups[brandId].products[existingProductIndex].orderNote !== order.note) {
              brandGroups[brandId].products[existingProductIndex].orderNote += '; ' + order.note;
            } else if (!brandGroups[brandId].products[existingProductIndex].orderNote && order.note) {
              brandGroups[brandId].products[existingProductIndex].orderNote = order.note;
            }
          } else {
            brandGroups[brandId].products.push(productInfo);
          }

          // Add order info to the brand's orders list if not already there
          const existingOrderIndex = brandGroups[brandId].orders.findIndex(o => o.orderId === order._id.toString());
          if (existingOrderIndex === -1) {
            brandGroups[brandId].orders.push({
              orderId: order._id.toString(),
              customer: `${order.firstName || ''} ${order.lastName || ''}`.trim(),
              note: order.note || ''
            });
          }
        }
      }

      productList.push({
        orderId: order._id.toString(),
        customer: `${order.firstName || ''} ${order.lastName || ''}`.trim(),
        note: order.note || '',  // Add the order note
        products: Object.entries(productCounts).map(([productId, quantity]) => ({
          id: productId,
          title: productsMap[productId]?.title || 'Unknown Product',
          quantity: quantity,
          // ✅ ADD brand to individual product list
          brand: productsMap[productId]?.brand ? (productsMap[productId].brand.toString()) : 'Sans marque'
        }))
      });
    }

    // Need to fetch brand names separately since they're not in productsMap
    const brandIds = Object.keys(brandGroups);
    if (brandIds.length > 0) {
      try {
        const brandPromises = brandIds.map(brandId =>
          axios.get(`/api/brands/${brandId}`).catch(() => ({ data: { name: 'Unknown Brand', image: '' } }))
        );
        const brandResponses = await Promise.all(brandPromises);

        brandResponses.forEach((response, index) => {
          const brandId = brandIds[index];
          if (brandGroups[brandId]) {
            brandGroups[brandId].brandName = response.data?.name || 'Unknown Brand';
            brandGroups[brandId].brandImage = response.data?.image || '';
          }
        });
      } catch (error) {
        console.error('Error fetching brand information:', error);
        // Set default values if API call fails
        brandIds.forEach(brandId => {
          if (brandGroups[brandId]) {
            brandGroups[brandId].brandName = 'Unknown Brand';
          }
        });
      }
    }

    // --- START OF FIX ---

    // 1. Create a map of BrandID -> BrandName from the fetched data
    const brandIdToNameMap = Object.values(brandGroups).reduce((acc, brand) => {
      acc[brand.brandId] = brand.brandName;
      return acc;
    }, {});

    // 2. Create consolidated product list and use the new map
    const consolidatedProducts = Object.entries(productQuantities).map(([productId, totalQuantity]) => {
      const product = productsMap[productId];
      const brandId = product?.brand?.toString() || null;
      // Use the map to get the correct name, fall back to "Sans marque"
      const brandName = brandId ? (brandIdToNameMap[brandId] || 'Sans marque') : 'Sans marque';

      return {
        id: productId,
        title: product?.title || 'Unknown Product',
        totalQuantity: totalQuantity,
        image: product?.images?.[0] || '',
        brand: brandName, // ✅ FIXED: Use the fetched brand name
        brandId: brandId,
        // Collect notes from all orders for this product
        notes: productList
          .flatMap(order => order.products
            .filter(p => p.id === productId && order.note)
            .map(p => order.note)
          )
          .filter((value, index, self) => self.indexOf(value) === index) // Unique notes
      };
    });

    // --- END OF FIX ---

    // Convert brandGroups object to array
    const brandsList = Object.values(brandGroups);

    // Sort brands alphabetically by name
    brandsList.sort((a, b) => a.brandName.localeCompare(b.brandName));

    // Also update individual order products to use the new map
    productList.forEach(order => {
      order.products.forEach(product => {
        const brandName = product.brand ? (brandIdToNameMap[product.brand] || 'Sans marque') : 'Sans marque';
        product.brand = brandName;
      });
    });

    return {
      individualOrders: productList,
      consolidatedProducts: consolidatedProducts,
      brandsList: brandsList, // Add the brand-based grouping
      totalOrders: orderList.length,
      totalUniqueProducts: consolidatedProducts.length,
      totalItems: consolidatedProducts.reduce((sum, p) => sum + p.totalQuantity, 0)
    };
  };

  const showShoppingListForSelected = async () => {
    const selectedOrderObjects = orders.filter(order => selectedOrders.includes(order._id));
    if (selectedOrderObjects.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Aucune commande sélectionnée",
        text: "Veuillez sélectionner au moins une commande pour générer la liste d'achat",
        timer: 2000,
        showConfirmButton: false,
      });
      return;
    }

    const shoppingListData = await generateShoppingList(selectedOrderObjects);
    setShoppingListOrders(shoppingListData);
    setShowShoppingList(true);
  };

  const showShoppingListForExpedieOrders = async () => {
    try {
      const expedieOrders = orders.filter(order => order.confirmed === "dispatched");
      if (expedieOrders.length === 0) {
        Swal.fire({
          icon: "info",
          title: "Aucune commande expédiée",
          text: "Il n'y a pas de commandes avec le statut 'expédié' pour le moment",
          timer: 2000,
          showConfirmButton: false,
        });
        return;
      }

      const shoppingListData = await generateShoppingList(expedieOrders);
      setShoppingListOrders(shoppingListData);
      setShowShoppingList(true);
    } catch (error) {
      console.error("Error generating expedie shopping list:", error);
      Swal.fire({
        icon: "error",
        title: "Erreur",
        text: "Impossible de générer la liste d'achat des commandes expédiées",
      });
    }
  };

  const closeShoppingList = () => {
    setShowShoppingList(false);
    setShoppingListOrders([]);
    // Remove the no-scroll class from body when closing
    document.body.classList.remove('overflow-hidden');
  };

  // Effect to handle body scroll when shopping list is shown
  useEffect(() => {
    if (showShoppingList) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }

    // Cleanup function to ensure scrolling is restored when component unmounts
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [showShoppingList]);

  const hideProductPreview = useCallback(() => {
    setProductPreview(null);
  }, []);


  const updateOrderField = useCallback(
       async (order, field, value) => {
      try {
        // Prepare update data
        const updateData = { [field]: value };

        // If updating confirmed status, also update confirmation metadata
        if (field === "confirmed") {
          updateData.confirmedBy = "current-user-id"; // Replace with actual user ID if available
          updateData.confirmedByName = "Utilisateur"; // Replace with actual user name if available
          updateData.confirmedAt = new Date().toISOString();
        }

        await axios.put(`/api/orders?id=${order._id}`, updateData);

        // Update local state with all changes
        const updatedOrder = { ...order, ...updateData };

        // Handle delivery price recalculation
        if (field === "delivery" || field === "state") {
          const newDeliveryPrice = calculateDeliveryPrice(updatedOrder);
          updatedOrder.del_pr = newDeliveryPrice;

          await axios.put(`/api/orders?id=${order._id}`, {
            del_pr: newDeliveryPrice,
          });
        }

        setOrders((prevOrders) =>
          prevOrders.map((o) => (o._id === order._id ? updatedOrder : o))
        );

        if (field === "confirmed") {
          const statusOption = statusOptions.find((opt) => opt.value === value);

          const toast = document.createElement("div");
          toast.className =
            "fixed top-4 right-4 z-50 bg-green-100 border border-green-300 text-green-800 px-4 py-2 rounded-lg shadow-md transition-all duration-300 transform translate-x-full";
          toast.innerHTML = `
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <span class="text-sm font-medium">Statut: ${statusOption?.label}</span>
          </div>
        `;
          document.body.appendChild(toast);


          setTimeout(() => {
            toast.classList.remove("translate-x-full");
          }, 100);

          setTimeout(() => {
            toast.classList.add("translate-x-full");
            setTimeout(() => {
              document.body.removeChild(toast);
            }, 300);
          }, 2000);
        }
      } catch (error) {
        console.error(`Error updating ${field}:`, error);
        Swal.fire({
          icon: "error",
          title: "Erreur",
          text: `Impossible de mettre à jour ${field}`,
        });
      }
    },
    [statusOptions]
  );

  const getCurrentDeliveryPrice = useCallback((order) => {

    return order.del_pr || calculateDeliveryPrice(order);
  }, []);


  const ProductsList = useCallback(
    ({ order, isCompact = false }) => {
      const { productCounts } = calculateOrderDetails(order);
      const uniqueProducts = Object.entries(productCounts);
      const displayLimit = isCompact ? 5 : 10;

     const [expandedProducts, setExpandedProducts] = useState({});

      const isExpanded = expandedProducts[order._id] || false;
      const productsToShow = isExpanded
        ? uniqueProducts
        : uniqueProducts.slice(0, displayLimit);
      const hasMoreProducts = uniqueProducts.length > displayLimit;

      const toggleExpanded = () => {
        setExpandedProducts((prev) => ({
          ...prev,
          [order._id]: !prev[order._id],
        }));
      };
      const groupedProductsByBrand = useMemo(() => {
  if (!shoppingListOrders.consolidatedProducts) return {};
  const groups = {};

  shoppingListOrders.consolidatedProducts.forEach((p) => {
    const brand = p.brand || "Sans marque";
    if (!groups[brand]) groups[brand] = [];
    groups[brand].push(p);
  });
  const productsGroupedByBrand = {};
order?.products?.forEach((p) => {
  const brand = p?.brand || "Sans marque";
  if (!productsGroupedByBrand[brand]) productsGroupedByBrand[brand] = [];
  productsGroupedByBrand[brand].push(p);
});

  return groups;
}, [shoppingListOrders.consolidatedProducts]);
      return (
        <div className="space-y-1">
          {productsToShow.length > 0 ? (
            productsToShow.map(([productId, quantity]) => {
              const product = productsMap[productId];
              if (!product) {
                // Handle case where product is not found in productsMap
                return (
                  <div
                    key={productId}
                    className="flex items-center justify-between bg-gray-50 rounded px-2 py-1"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <FaBox className="text-emerald-600 text-xs" />
                      <span className="text-gray-500 text-sm font-medium truncate">
                        Produit inconnu (ID: {productId.substring(0, 8)}...)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {quantity > 1 && (
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-semibold">
                          ×{quantity}
                        </span>
                      )}
                      <span className="text-gray-500 font-medium">N/A</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={productId}
                  className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 hover:bg-gray-100 transition-colors cursor-pointer"
                  onMouseEnter={(e) => showProductPreview(productId, e)}
                  onMouseLeave={hideProductPreview}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <FaBox className="text-emerald-600 text-xs" />
                    <Link
                      href={`https://bricomaitre.com/products/${product._id}`}
                      className={`text-sm font-medium truncate ${
    hasSecondary(product._id)
      ? "text-emerald-600 hover:text-emerald-800"
      : "text-gray-500 hover:text-gray-700"
  }`}
                    >
                      {isCompact
                        ? `${product.title.substring(0, 25)}...`
                        : `${product.title.substring(0, 40)}...`}
                    </Link>

                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {quantity > 1 && (
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-semibold">
                        ×{quantity}
                      </span>

                    )}
                    <span className="text-gray-700 font-medium">
                      {(product.price * quantity).toLocaleString()} DA
                    </span>
                  </div>

                </div>
              );
            })
          ) : (
            <div className="text-center py-2 text-gray-500 text-sm">
              Aucun produit
            </div>
          )}

          {hasMoreProducts && (
            <button
              onClick={toggleExpanded}
              className="text-xs text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded px-2 py-1 transition-colors cursor-pointer font-medium flex items-center gap-1 w-full justify-center"
            >
              {isExpanded ? (
                <>
                  <span>Réduire la liste</span>
                  <span className="text-emerald-500">↑</span>
                </>
              ) : (
                <>
                  <span>
                    +{uniqueProducts.length - displayLimit} autre(s) produit(s)
                  </span>
                  <span className="text-emerald-500">↓</span>
                </>
              )}
            </button>
          )}
        </div>
      );
    },
    [calculateOrderDetails, productsMap, showProductPreview, hideProductPreview]
  );


  const StatusDropdown = useCallback(
    ({ order }) => {
      const currentStatus =
        statusOptions.find((opt) => opt.value === order.confirmed) ||
        statusOptions[0];

      return (
        <select
          value={order.confirmed}
          onChange={(e) => updateOrderField(order, "confirmed", e.target.value)}
          className={`text-xs font-medium border rounded-full px-3 py-1 cursor-pointer transition-colors ${getStatusColor(
            order.confirmed
          )} hover:opacity-80 focus:ring-2 focus:ring-emerald-500 focus:outline-none`}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    },
    [statusOptions, getStatusColor, updateOrderField]
  );


  const paginationOptions = useMemo(() => {
    return Array.from({ length: pagination.totalPages }, (_, i) => ({
      value: i + 1,
      label: `Page ${i + 1}`,
    }));
  }, [pagination.totalPages]);
  const getCommunesForState = useCallback((stateName) => {
    const wilayaCode = getCodeFromState(stateName);
    return wilayaCode && communesData[wilayaCode]
      ? communesData[wilayaCode]
      : [];
  }, []);
  const showStatusHistory = useCallback((order) => {
  const statusLabels = {
    nocon: "Pas contacté",
    no2: "Sans réponse",
    no3: "Sans réponse 2",
    no4: "Sans réponse 3",
    yes: "Confirmée",
    dispatched: "Expédié",
    delivered: "Livrée",
    delayed: "Reportée",
    complete: "Complétée",
    cancelled: "Annulée",
  };

  const historyHTML =
    order.statusHistory && order.statusHistory.length > 0
      ? order.statusHistory
          .slice()
          .reverse()
          .map((history) => {
            return `
              <div class="bg-gray-50 rounded-lg p-3 border-l-4 border-emerald-500 mb-3 text-left">
                <div class="flex justify-between items-start mb-2">
                  <span class="font-semibold text-gray-900">
                    ${statusLabels[history.status] || history.status}
                  </span>
                  <span class="text-xs text-gray-500">
                    ${new Date(history.changedAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div class="flex items-center gap-2 text-sm text-gray-600">
                  <svg class="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
                  </svg>
                  <span>${history.changedByName || history.changedBy}</span>
                </div>
              </div>
            `;
          })
          .join("")
      : '<div class="text-center text-gray-500 py-4">Aucun historique disponible</div>';

  Swal.fire({
    title: "Historique des statuts",
    html: historyHTML,
    width: 600,
    showCloseButton: true,
    confirmButtonColor: "#059669",
  });
}, []);

  return (
    <Layout>
      <div className="container mx-auto p-6 min-h-screen">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-4xl font-bold text-center text-emerald-600 mb-2">
            Page des Commandes
          </h1>

          {/* ECOTRACK Integration Panel */}
          <div className="bg-gradient-to-r from-blue-50 to-emerald-50 rounded-lg p-4 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 rounded-full p-2">
                  <FaCloud className="text-white" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">
                    Synchronisation ECOTRACK
                  </h3>
                  <p className="text-sm text-gray-600">
                    Intégration avec le service de livraison ECOTRACK


                  </p>
                </div>
              </div>



<button
        onClick={runEcotrackMigration}
        disabled={migrationInProgress}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        {migrationInProgress ? (
          <FaSpinner className="animate-spin" size={14} />
        ) : (
          <FaClipboardCheck size={14} />
        )}
        Migration
      </button>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={syncSelectedOrdersToEcotrack}
                  disabled={selectedOrders.length === 0 || syncInProgress}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncInProgress ? (
                    <FaSpinner className="animate-spin" size={14} />
                  ) : (
                    <FaSync size={14} />
                  )}
                  Sync Sélectionnées ({selectedOrders.length})
                </button>

                <button
                  onClick={syncConfirmedOrders}
                  disabled={syncInProgress}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncInProgress ? (
                    <FaSpinner className="animate-spin" size={14} />
                  ) : (
                    <FaCheckCircle size={14} />
                  )}
                  Sync Confirmées
                </button>
              </div>
            </div>

            {/* Sync Results */}
            {syncResults && (
              <div className="mt-4 p-3 bg-white rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">
                    Dernière synchronisation:
                  </span>
                  <div className="flex gap-4 text-sm">
                    <span className="flex items-center gap-1 text-green-600">
                      <FaCheckCircle size={12} />
                      {syncResults.successful} réussie(s)
                    </span>
                    {syncResults.failed > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <FaExclamationTriangle size={12} />
                        {syncResults.failed} échec(s)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-4">




            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => bulkUpdateStatus("yes")}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <FaCheck size={14} />
                Confirmer ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("cancelled")}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <FaTrash size={14} />
                Annuler ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("no2")}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
              >
                <FaEye size={14} />
                Sans Réponse ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("no3")}
                className="bg-yellow-700 text-white px-4 py-2 rounded-lg hover:bg-yellow-800 transition-colors flex items-center gap-2"
              >
                <FaEye size={14} />
                Sans Réponse 2 ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("no4")}
                className="bg-yellow-800 text-white px-4 py-2 rounded-lg hover:bg-yellow-900 transition-colors flex items-center gap-2"
              >
                <FaEye size={14} />
                Sans Réponse 3 ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("dispatched")}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <FaShippingFast size={14} />
                Expédié ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("delivered")}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
              >
                <FaBoxOpen size={14} />
                Livrée ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("delayed")}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
              >
                <FaClock size={14} />
                Reportée ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("complete")}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <FaClipboardCheck size={14} />
                Complétée ({selectedOrders.length})
              </button>
              <button
                onClick={() => bulkUpdateStatus("nocon")}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <FaPhoneSlash size={14} />
                Pas contacté ({selectedOrders.length})
              </button>
              <button
                onClick={showShoppingListForSelected}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                disabled={selectedOrders.length === 0}
              >
                <FaList size={14} />
                Liste d'achat ({selectedOrders.length})
              </button>
              <button
                onClick={calculateProfitForSelectedOrders}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
                disabled={selectedOrders.length === 0}
              >
                <FaMoneyBillWave size={14} />
                Profit ({selectedOrders.length})
              </button>
              <button
                onClick={showShoppingListForExpedieOrders}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
              >
                <FaBox size={14} />
                Expédié → Liste
              </button>
              <button
                onClick={copySelectedOrdersProducts}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                disabled={selectedOrders.length === 0}
              >
                <FaClipboard size={14} />
                Copier Produits ({selectedOrders.length})
              </button>
<button
  onClick={refreshAllEcotrackStatuses}
  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
>
  <FaSync size={14} />
  Mettre à jour tous les statuts ECOTRACK
</button>
<button
  onClick={() => refreshEcotrackStatus(selectedOrders)}
  className="bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 transition-colors flex items-center gap-2"
  disabled={selectedOrders.length === 0}
>
  <FaSync size={14} />
  Actualiser ECOTRACK ({selectedOrders.length})
</button>
            </div>
            {/* View Mode Buttons */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("table")}
                className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
                  viewMode === "table"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                <FaList size={14} />
                Tableau
              </button>
              <button
                onClick={() => setViewMode("card")}
                className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
                  viewMode === "card"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                <FaTh size={14} />
                Cartes
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={() => setViewAll((prev) => !prev)}
          className="bg-indigo-600 text-white px-6 py-2 mb-6
           rounded-full hover:bg-indigo-700 flex mx-auto transition-colors text-center"
        >
          {viewAll ? "Voir par pages" : "Voir 200 commandes"}
        </button>

        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="relative">
              <input
                type="search"
                placeholder="Rechercher par nom"
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-gray-50 focus:bg-white transition-colors"
                value={nameSearch}
                onChange={handleNameSearchChange}
              />
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>

            <div className="relative">
              <input
                type="search"
                placeholder="Rechercher par téléphone"
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-gray-50 focus:bg-white transition-colors"
                value={phoneSearch}
                onChange={handlePhoneSearchChange}
              />
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>

            <select
              value={filter.confirmed}
              onChange={handleFilterChange}
              className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-gray-50 focus:bg-white transition-colors"
            >
              <option value="">Tous les statuts</option>
              <option value="nocon">Pas contacté</option>
              <option value="no2">Sans réponse</option>
              <option value="no3">Sans réponse 2</option>
              <option value="no4">Sans réponse 3</option>
              <option value="yes">Confirmée</option>
              <option value="dispatched">Expédié</option>
              <option value="delivered">Livrée</option>
              <option value="delayed">Reportée</option>
              <option value="complete">Complétée</option>
              <option value="cancelled">Annulée</option>
            </select>
          </div>

          {/* Sorting */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-gray-700">
              Trier par :
            </label>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50"
            >
              <option value="createdAt">Date de commande</option>
              <option value="firstName">Nom du client</option>
              <option value="confirmed">Statut</option>
            </select>
            <button
              onClick={() =>
                setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
              }
              className="text-sm px-3 py-2 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              {sortOrder === "asc" ? "⬆️ Croissant" : "⬇️ Décroissant"}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        )}

        {/* Results count */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex justify-between items-center">
            <p className="text-gray-600 flex items-center gap-2">
              <FaEye className="text-emerald-600" />
              {pagination.totalCount} commande(s) trouvée(s) • Page{" "}
              {pagination.currentPage} sur {pagination.totalPages}
            </p>
          </div>
        </div>

        {/* Orders Display */}
        {viewMode === "table" ? (
          <animated.div
            className="bg-white rounded-lg shadow-sm overflow-hidden"
            style={fadeIn}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap table-auto">
                <thead className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      <input
                        type="checkbox"
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        checked={
                          selectedOrders.length === orders.length &&
                          orders.length > 0
                        }
                        className="rounded"
                      />
                    </th>
                    <th
                      className="px-6 py-4 text-left cursor-pointer hover:bg-emerald-800 transition-colors"
                      onClick={() => toggleSort("createdAt")}
                    >
                      <div className="flex items-center gap-2">
                        <FaCalendar size={14} />
                        Date{" "}
                        {sortField === "createdAt" &&
                          (sortOrder === "asc" ? "↑" : "↓")}
                      </div>
                    </th>
                    <th
                      className="px-6 py-4 text-left cursor-pointer hover:bg-emerald-800 transition-colors"
                      onClick={() => toggleSort("firstName")}
                    >
                      <div className="flex items-center gap-2">
                        <FaUser size={14} />
                        Client{" "}
                        {sortField === "firstName" &&
                          (sortOrder === "asc" ? "↑" : "↓")}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2">
                        <FaBox size={14} />
                        Produits
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2">
                        <FaMapMarkerAlt size={14} />
                        Adresse
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left">Montant</th>
                    <th
                      className="px-6 py-4 text-left cursor-pointer hover:bg-emerald-800 transition-colors"
                      onClick={() => toggleSort("confirmed")}
                    >
                      Statut{" "}
                      {sortField === "confirmed" &&
                        (sortOrder === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-6 py-4 text-left">Confirmé par</th>
                    <th className="px-6 py-4 text-left">
  <div className="flex items-center gap-2">
    <FaCloud size={14} />
    Statut ECOTRACK
  </div>
</th>
                    <th className="px-6 py-4 text-left">Notes</th>
                    <th className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, index) => (
                    <tr
                      key={order._id}
                      className={`${
                        index % 2 === 0 ? "bg-gray-50" : "bg-white"
                      } hover:bg-emerald-50 transition-colors border-b border-gray-100`}
                    >
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedOrders.includes(order._id)}
                          onChange={(e) =>
                            handleSelectOrder(order._id, e.target.checked)
                          }
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {new Date(order.createdAt).toLocaleDateString(
                            "fr-FR"
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(order.createdAt).toLocaleTimeString(
                            "fr-FR",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="space-y-2">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {order.firstName} {order.lastName}
                            </p>
                          </div>
<div className="flex items-center gap-3">
  <EditablePhone
    order={order}
    phoneField="phoneNumber1"
    updateOrderField={updateOrderField}
  />
</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="max-w-xs">
                          <ProductsList order={order} isCompact={true} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="text-sm space-y-1">
                          <div className="flex items-center gap-2">
                            <FaMapMarkerAlt
                              className="text-emerald-600"
                              size={12}
                            />
                            <span className="font-medium">
                              <select
                                onChange={async (ev) => {
                                  await updateOrderField(
                                    order,
                                    "delivery",
                                    ev.target.value
                                  );
                                }}
                                value={order.delivery}
                                className="text-xs border rounded px-1"
                              >
                                <option value="home">home</option>
                                <option value="office">office</option>
                              </select>
                              <select
                                value={order.state}
                                onChange={async (ev) => {
                                  await updateOrderField(
                                    order,
                                    "state",
                                    ev.target.value
                                  );
                                }}
                                className="text-xs border rounded px-1 ml-1"
                              >
                                <option value="Adrar">Adrar</option>
                                <option value="Chlef">Chlef</option>
                                <option value="Laghouat">Laghouat</option>
                                <option value="Oum El Bouaghi">
                                  Oum El Bouaghi
                                </option>
                                <option value="Batna">Batna</option>
                                <option value="Béjaïa">Béjaïa</option>
                                <option value="Biskra">Biskra</option>
                                <option value="Béchar">Béchar</option>
                                <option value="Blida">Blida</option>
                                <option value="Bouïra">Bouïra</option>
                                <option value="Tamanrasset">Tamanrasset</option>
                                <option value="Tebessa">Tébessa</option>
                                <option value="Tlemcen">Tlemcen</option>
                                <option value="Tiaret">Tiaret</option>
                                <option value="Tizi Ouzou">Tizi Ouzou</option>
                                <option value="Alger">Alger</option>
                                <option value="Djelfa">Djelfa</option>
                                <option value="Jijel">Jijel</option>
                                <option value="Sétif">Sétif</option>
                                <option value="Saïda">Saïda</option>
                                <option value="Skikda">Skikda</option>
                                <option value="Sidi Bel Abbès">
                                  Sidi Bel Abbès
                                </option>
                                <option value="Annaba">Annaba</option>
                                <option value="Guelma">Guelma</option>
                                <option value="Constantine">Constantine</option>
                                <option value="Médéa">Médéa</option>
                                <option value="Mostaganem">Mostaganem</option>
                                <option value="Msila">Msila</option>
                                <option value="Mascara">Mascara</option>
                                <option value="Ouargla">Ouargla</option>
                                <option value="Oran">Oran</option>
                                <option value="El Bayadh">El Bayadh</option>
                                <option value="Illizi">Illizi</option>
                                <option value="Bordj Bou Arreridj">
                                  Bordj Bou Arreridj
                                </option>
                                <option value="Boumerdès">Boumerdès</option>
                                <option value="El Tarf">El Tarf</option>
                                <option value="Tindouf">Tindouf</option>
                                <option value="Tissemsilt">Tissemsilt</option>
                                <option value="El Oued">El Oued</option>
                                <option value="Khenchela">Khenchela</option>
                                <option value="Souk Ahras">Souk Ahras</option>
                                <option value="Tipaza">Tipaza</option>
                                <option value="Mila">Mila</option>
                                <option value="Aïn Defla">Aïn Defla</option>
                                <option value="Naâma">Naâma</option>
                                <option value="Aïn Témouchent">
                                  Aïn Témouchent
                                </option>
                                <option value="Ghardaïa">Ghardaïa</option>
                                <option value="Relizane">Relizane</option>
                                <option value="Timimoun">Timimoun</option>
                                <option value="Bordj Badji Mokhtar">
                                  Bordj Badji Mokhtar
                                </option>
                                <option value="Ouled Djellal">
                                  Ouled Djellal
                                </option>
                                <option value="Béni Abbès">Béni Abbès</option>
                                <option value="In Salah">In Salah</option>
                                <option value="In Guezzam">In Guezzam</option>
                                <option value="Touggourt">Touggourt</option>
                                <option value="Djanet">Djanet</option>
                                <option value="El Mghair">El Mghair</option>
                                <option value="El Meniaa">El Meniaa</option>
                              </select>
                            </span>
                            <select
                              value={order.city}
                              onChange={async (ev) => {
                                await updateOrderField(
                                  order,
                                  "city",
                                  ev.target.value
                                );
                              }}
                              className="text-xs border rounded px-1 ml-1"
                            >
                              <option value="">-- commune --</option>
                              {getCommunesForState(order.state).map(
                                (commune, index) => (
                                  <option key={index} value={commune}>
                                    {commune}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                          <p className="text-gray-600 text-xs">
                            {order.homeAddress?.substring(0, 40)}...
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="text-sm space-y-1">
                          <div className="bg-gray-50 rounded p-2 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Prod:</span>
                              <span className="font-medium">
                                {calculateSubtotal(order).toLocaleString()} DA
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Liv:</span>
                              <span className="font-medium">
                                {getCurrentDeliveryPrice(order)} DA
                              </span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                              <span className="font-semibold text-gray-900">
                                Total:
                              </span>
                              <span className="font-bold text-emerald-600">
                                {(
                                  calculateSubtotal(order) +
                                  (order.del_pr ||
                                    calculateDeliveryPrice(order))
                                ).toLocaleString()}{" "}
                                DA
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <StatusDropdown order={order} />
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
  <div className="flex items-center gap-2">
    <OrderSignature order={order} />
    {order.statusHistory && order.statusHistory.length > 0 && (
      <button
        onClick={() => showStatusHistory(order)}
        className="text-gray-600 hover:text-emerald-600 transition-colors p-1 rounded hover:bg-gray-100"
        title="Voir l'historique"
      >
        <FaHistory size={12} />
      </button>
    )}
  </div>
</td>
<td className="px-4 py-3 text-xs whitespace-nowrap">
  <EcotrackStatusBadge
    order={order}
    onRefresh={refreshEcotrackStatus}
  />
</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className="w-24 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            placeholder="Note..."
                            value={orderNotes[order._id] || ""}
                            onChange={(e) =>
                              setOrderNotes((prev) => ({
                                ...prev,
                                [order._id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) =>
                              e.key === "Enter" && updateNote(order)
                            }
                          />
                          <button
                            onClick={() => updateNote(order)}
                            className="text-emerald-600 hover:text-emerald-800 transition-colors"
                            title="Sauvegarder la note"
                          >
                            <FaEdit size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
  onClick={() => setEditingOrder(order)}
  className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
  title="Modifier les produits"
>
  <FaEdit size={14} />
</button>
                          <button
                            onClick={() => {
                              const { productCounts } =
                                calculateOrderDetails(order);
                              const productsList = Object.entries(productCounts)
                                .map(([productId, quantity]) => {
                                  const product = productsMap[productId];
                                  return product
                                    ? `${product.title} (×${quantity}) - ${(
                                        product.price * quantity
                                      ).toLocaleString()} DA`
                                    : "";
                                })
                                .filter(Boolean)
                                .join("<br>");

                              Swal.fire({
                                title: "Détails de la commande",
                                html: `
                                  <div class="text-left space-y-3">
                                    <div class="bg-gray-50 p-3 rounded">
                                      <p><strong>Client:</strong> ${
                                        order.firstName
                                      } ${order.lastName}</p>
                                      <p><strong>Téléphone:</strong> 0${
                                        order.phoneNumber1
                                      }</p>
                                      ${
                                        order.phoneNumber2
                                          ? `<p><strong>Téléphone 2:</strong> 0${order.phoneNumber2}</p>`
                                          : ""
                                      }
                                    </div>
                                    <div class="bg-gray-50 p-3 rounded">
                                      <p><strong>Adresse:</strong> ${
                                        order.homeAddress
                                      }</p>
                                      <p><strong>Ville:</strong> ${
                                        order.city
                                      }, ${order.state}</p>
                                    </div>
                                    <div class="bg-gray-50 p-3 rounded">
                                      <p><strong>Produits:</strong></p>
                                      <div class="mt-2 text-sm">${productsList}</div>
                                    </div>
                                    <div class="bg-gray-50 p-3 rounded">
                                      <p><strong>Note:</strong> ${
                                        order.note || "Aucune note"
                                      }</p>
                                    </div>
                                    ${order.ecotrackTrackingNumber ? `
  <div class="bg-blue-50 p-3 rounded">
    <p><strong>ECOTRACK:</strong></p>
    <p class="text-sm mt-1"><strong>N° Suivi:</strong> ${order.ecotrackTrackingNumber}</p>
    <p class="text-sm"><strong>Statut:</strong> ${
      (() => {
        const statusMap = {
          'en_attente': 'En attente',
          'prete_a_expedier': 'Prête à expédier',
          'ramassee': 'Ramassée',
          'en_transit': 'En transit',
          'centre_de_tri': 'Au centre de tri',
          'en_livraison': 'En livraison',
          'tentative_livraison': 'Tentative de livraison',
          'livree': 'Livrée',
          'reportee': 'Reportée',
          'retournee': 'Retournée',
          'retournee_expediteur': 'Retournée expéditeur',
          'annulee': 'Annulée',
          'payé_et_archivé': 'Payé et archivé',
        };
        const status = order.ecotrackCurrentStatus || order.ecotrackStatus || 'N/A';
        return statusMap[status] || status;
      })()
    }</p>
    ${order.ecotrackLastSync ? `
      <p class="text-xs text-gray-500 mt-1">
        Dernière sync: ${new Date(order.ecotrackLastSync).toLocaleString('fr-FR')}
      </p>
    ` : ''}
  </div>
` : ''}
                                  </div>
                                `,
                                width: 700,
                                showCloseButton: true,
                                confirmButtonColor: "#059669",
                              });
                            }}
                            className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50"
                            title="Voir les détails"
                          >
                            <FaEye size={14} />
                          </button>
                          <button
                            onClick={() => deleteOrder(order)}
                            className="text-red-600 hover:text-red-800 transition-colors p-1 rounded hover:bg-red-50"
                            title="Supprimer la commande"
                          >
                            <FaTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </animated.div>
        ) : (
          <animated.div
            className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
            style={fadeIn}
          >
            {orders.map((order) => (
              <div
                key={order._id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                {/* Card Header */}
                <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 p-4 border-b">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">
                        {order.firstName} {order.lastName}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FaCalendar size={12} />
                        <div>
                          <span>
                            {new Date(order.createdAt).toLocaleDateString(
                              "fr-FR"
                            )}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {new Date(order.createdAt).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <StatusDropdown order={order} />
                    {order.confirmedByName && (
  <div className="mt-2 flex items-center justify-between">
    <OrderSignature order={order} />
    {order.statusHistory && order.statusHistory.length > 0 && (
      <button
        onClick={() => showStatusHistory(order)}
        className="text-gray-600 hover:text-emerald-600 transition-colors p-1 rounded hover:bg-gray-100"
        title="Voir l'historique"
      >
        <FaHistory size={14} />
      </button>
    )}
  </div>
)}
                  </div>
{order.ecotrackTrackingNumber && (
  <div className="bg-blue-50 rounded-lg p-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <FaCloud className="text-blue-600" size={14} />
        ECOTRACK
      </span>
    </div>
    <EcotrackStatusBadge
      order={order}
      onRefresh={refreshEcotrackStatus}
    />
  </div>
)}
                  {/* Contact Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-white rounded px-3 py-2">
                      <FaPhone className="text-emerald-600" size={14} />
                      <span className="text-sm font-medium">
                        0{order.phoneNumber1}
                      </span>
                      <div className="flex gap-1 ml-auto">
                        <button
                          onClick={() => handleCopy(order)}
                          className="text-emerald-600 hover:text-emerald-800 transition-colors p-1 rounded hover:bg-emerald-50"
                          title="Copier le nom"
                        >
                          <FaCopy size={12} />
                        </button>
                        <a
                          href={`tel:0${order.phoneNumber1}`}
                          className="text-emerald-600 hover:text-emerald-800 transition-colors p-1 rounded hover:bg-emerald-50"
                          title="Appeler"
                        >
                          <FaPhone size={12} />
                        </a>
                      </div>
                    </div>

                    {order.phoneNumber2 && (
                      <div className="flex items-center gap-2 bg-white rounded px-3 py-2">
                        <FaPhone className="text-emerald-600" size={14} />
                        <span className="text-sm font-medium">
                          0{order.phoneNumber2}
                        </span>
                        <a
                          href={`tel:0${order.phoneNumber2}`}
                          className="text-emerald-600 hover:text-emerald-800 transition-colors p-1 rounded hover:bg-emerald-50 ml-auto"
                          title="Appeler"
                        >
                          <FaPhone size={12} />
                        </a>
                      </div>
                    )}

                    <div className="flex items-center gap-2 bg-white rounded px-3 py-2">
                      <FaMapMarkerAlt className="text-emerald-600" size={14} />
                      <span className="font-medium">
                        <select
                          onChange={async (ev) => {
                            await updateOrderField(
                              order,
                              "delivery",
                              ev.target.value
                            );
                          }}
                          value={order.delivery}
                          className="text-xs border rounded px-1"
                        >
                          <option value="home">home</option>
                          <option value="office">office</option>
                        </select>
                        <select
                          value={order.state}
                          onChange={async (ev) => {
                            await updateOrderField(
                              order,
                              "state",
                              ev.target.value
                            );
                          }}
                          className="text-xs border rounded px-1 ml-1"
                        >
                          <option value="Adrar">Adrar</option>
                          <option value="Chlef">Chlef</option>
                          <option value="Laghouat">Laghouat</option>
                          <option value="Oum El Bouaghi">Oum El Bouaghi</option>
                          <option value="Batna">Batna</option>
                          <option value="Béjaïa">Béjaïa</option>
                          <option value="Biskra">Biskra</option>
                          <option value="Béchar">Béchar</option>
                          <option value="Blida">Blida</option>
                          <option value="Bouïra">Bouïra</option>
                          <option value="Tamanrasset">Tamanrasset</option>
                          <option value="Tebessa">Tébessa</option>
                          <option value="Tlemcen">Tlemcen</option>
                          <option value="Tiaret">Tiaret</option>
                          <option value="Tizi Ouzou">Tizi Ouzou</option>
                          <option value="Alger">Alger</option>
                          <option value="Djelfa">Djelfa</option>
                          <option value="Jijel">Jijel</option>
                          <option value="Sétif">Sétif</option>
                          <option value="Saïda">Saïda</option>
                          <option value="Skikda">Skikda</option>
                          <option value="Sidi Bel Abbès">Sidi Bel Abbès</option>
                          <option value="Annaba">Annaba</option>
                          <option value="Guelma">Guelma</option>
                          <option value="Constantine">Constantine</option>
                          <option value="Médéa">Médéa</option>
                          <option value="Mostaganem">Mostaganem</option>
                          <option value="Msila">Msila</option>
                          <option value="Mascara">Mascara</option>
                          <option value="Ouargla">Ouargla</option>
                          <option value="Oran">Oran</option>
                          <option value="El Bayadh">El Bayadh</option>
                          <option value="Illizi">Illizi</option>
                          <option value="Bordj Bou Arreridj">
                            Bordj Bou Arreridj
                          </option>
                          <option value="Boumerdès">Boumerdès</option>
                          <option value="El Tarf">El Tarf</option>
                          <option value="Tindouf">Tindouf</option>
                          <option value="Tissemsilt">Tissemsilt</option>
                          <option value="El Oued">El Oued</option>
                          <option value="Khenchela">Khenchela</option>
                          <option value="Souk Ahras">Souk Ahras</option>
                          <option value="Tipaza">Tipaza</option>
                          <option value="Mila">Mila</option>
                          <option value="Aïn Defla">Aïn Defla</option>
                          <option value="Naâma">Naâma</option>
                          <option value="Aïn Témouchent">Aïn Témouchent</option>
                          <option value="Ghardaïa">Ghardaïa</option>
                          <option value="Relizane">Relizane</option>
                          <option value="Timimoun">Timimoun</option>
                          <option value="Bordj Badji Mokhtar">
                            Bordj Badji Mokhtar
                          </option>
                          <option value="Ouled Djellal">Ouled Djellal</option>
                          <option value="Béni Abbès">Béni Abbès</option>
                          <option value="In Salah">In Salah</option>
                          <option value="In Guezzam">In Guezzam</option>
                          <option value="Touggourt">Touggourt</option>
                          <option value="Djanet">Djanet</option>
                          <option value="El Mghair">El Mghair</option>
                          <option value="El Meniaa">El Meniaa</option>
                        </select>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-4">
                  {/* Products */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <FaBox className="text-emerald-600" size={14} />
                      <h4 className="font-semibold text-gray-900">Produits</h4>
                    </div>
                    <ProductsList order={order} />
                  </div>

                  {/* Address */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600 font-medium mb-1">
                      Adresse de livraison:
                    </p>
                    <p className="text-sm text-gray-800">{order.homeAddress}</p>
                  </div>

                  {/* Pricing */}
                  <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Produits:</span>
                      <span className="font-medium">
                        {calculateSubtotal(order).toLocaleString()} DA
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Livraison:</span>
                      <span className="font-medium">
                        {(
                          order.del_pr || calculateDeliveryPrice(order)
                        ).toLocaleString()}{" "}
                        DA
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-700 border-t border-emerald-200 pt-2">
                      <span>Total:</span>
                      <span>
                        {(
                          calculateSubtotal(order) +
                          (order.del_pr || calculateDeliveryPrice(order))
                        ).toLocaleString()}{" "}
                        DA
                      </span>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Ajouter une note..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      value={orderNotes[order._id] || ""}
                      onChange={(e) =>
                        setOrderNotes((prev) => ({
                          ...prev,
                          [order._id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && updateNote(order)}
                    />
                    <button
                      onClick={() => updateNote(order)}
                      className="text-emerald-600 hover:text-emerald-800 transition-colors p-2 rounded-lg hover:bg-emerald-50"
                      title="Sauvegarder la note"
                    >
                      <FaEdit size={14} />
                    </button>
                  </div>
                </div>
                {/* Card Footer */}
                <div className="bg-gray-50 px-4 py-3 flex justify-between items-center">
                  <input
                    type="checkbox"
                    checked={selectedOrders.includes(order._id)}
                    onChange={(e) =>
                      handleSelectOrder(order._id, e.target.checked)
                    }
                    className="rounded"
                  />
                  <div className="flex gap-2">
                    <button
      onClick={() => setEditingOrder(order)}
      className="text-indigo-600 hover:text-indigo-800 transition-colors p-2 rounded-lg hover:bg-indigo-50"
      title="Modifier les produits"
    >
      <FaEdit size={14} />
    </button>
                    <button
                      onClick={() => {
                        const { productCounts } = calculateOrderDetails(order);
                        const productsList = Object.entries(productCounts)
                          .map(([productId, quantity]) => {
                            const product = productsMap[productId];
                            return product
                              ? `${product.title} (×${quantity}) - ${(
                                  product.price * quantity
                                ).toLocaleString()} DA`
                              : "";
                          })
                          .filter(Boolean)
                          .join("<br>");

                        Swal.fire({
                          title: "Détails de la commande",
                          html: `
                            <div class="text-left space-y-3">
                              <div class="bg-gray-50 p-3 rounded">
                                <p><strong>Client:</strong> ${
                                  order.firstName
                                } ${order.lastName}</p>
                                <p><strong>Téléphone:</strong> 0${
                                  order.phoneNumber1
                                }</p>
                                ${
                                  order.phoneNumber2
                                    ? `<p><strong>Téléphone 2:</strong> 0${order.phoneNumber2}</p>`
                                    : ""
                                }
                              </div>
                              <div class="bg-gray-50 p-3 rounded">
                                <p><strong>Adresse:</strong> ${
                                  order.homeAddress
                                }</p>
                                <p><strong>Ville:</strong> ${order.city}, ${
                            order.state
                          }</p>
                              </div>
                              <div class="bg-gray-50 p-3 rounded">
                                <p><strong>Produits:</strong></p>
                                <div class="mt-2 text-sm">${productsList}</div>
                              </div>
                              <div class="bg-gray-50 p-3 rounded">
                                <p><strong>Note:</strong> ${
                                  order.note || "Aucune note"
                                }</p>
                              </div>
                              ${order.ecotrackTrackingNumber ? `
  <div class="bg-blue-50 p-3 rounded">
    <p><strong>ECOTRACK:</strong></p>
    <p class="text-sm mt-1"><strong>N° Suivi:</strong> ${order.ecotrackTrackingNumber}</p>
    <p class="text-sm"><strong>Statut:</strong> ${
      (() => {
        const statusMap = {
          'en_attente': 'En attente',
          'prete_a_expedier': 'Prête à expédier',
          'ramassee': 'Ramassée',
          'en_transit': 'En transit',
          'centre_de_tri': 'Au centre de tri',
          'en_livraison': 'En livraison',
          'tentative_livraison': 'Tentative de livraison',
          'livree': 'Livrée',
          'reportee': 'Reportée',
          'retournee': 'Retournée',
          'retournee_expediteur': 'Retournée expéditeur',
          'annulee': 'Annulée',
          'payé_et_archivé': 'Payé et archivé',
        };
        const status = order.ecotrackCurrentStatus || order.ecotrackStatus || 'N/A';
        return statusMap[status] || status;
      })()
    }</p>
    ${order.ecotrackLastSync ? `
      <p class="text-xs text-gray-500 mt-1">
        Dernière sync: ${new Date(order.ecotrackLastSync).toLocaleString('fr-FR')}
      </p>
    ` : ''}
  </div>
` : ''}
                              ${order.confirmedByName ? `
  <div class="bg-gray-50 p-3 rounded">
    <p><strong>Confirmé par:</strong> ${order.confirmedByName}</p>
    ${order.confirmedAt ? `
      <p><strong>Date de confirmation:</strong> ${new Date(order.confirmedAt).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}</p>
    ` : ''}
  </div>
` : ''}
${order.ecotrackTrackingNumber ? `
  <div class="bg-blue-50 p-3 rounded">
    <p><strong>ECOTRACK:</strong></p>
    <p class="text-sm mt-1"><strong>N° Suivi:</strong> ${order.ecotrackTrackingNumber}</p>
    <p class="text-sm"><strong>Statut:</strong> ${order.ecotrackCurrentStatus || order.ecotrackStatus || 'N/A'}</p>
    ${order.ecotrackLastSync ? `
      <p class="text-xs text-gray-500 mt-1">
        Dernière sync: ${new Date(order.ecotrackLastSync).toLocaleString('fr-FR')}
      </p>
    ` : ''}
  </div>
` : ''}
                            </div>
                          `,
                          width: 700,
                          showCloseButton: true,
                          confirmButtonColor: "#059669",
                        });
                      }}
                      className="text-blue-600 hover:text-blue-800 transition-colors p-2 rounded-lg hover:bg-blue-50"
                      title="Voir les détails"
                    >
                      <FaEye size={14} />
                    </button>
                    <button
                      onClick={() => deleteOrder(order)}
                      className="text-red-600 hover:text-red-800 transition-colors p-2 rounded-lg hover:bg-red-50"
                      title="Supprimer la commande"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </animated.div>
        )}

        {/* Product Preview Tooltip */}
        {productPreview && (
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm pointer-events-none"
            style={{
              left: Math.min(productPreview.x + 10, window.innerWidth - 350),
              top: Math.min(productPreview.y + 10, window.innerHeight - 200),
            }}
          >
            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900 text-sm">
                {productPreview.product.title}
              </h4>
              {productPreview.product.images &&
                productPreview.product.images[0] && (
                  <img
                    src={productPreview.product.images[0]}
                    alt={productPreview.product.title}
                    className="w-full h-32 object-contain rounded max-w-xs"
                  />
                )}
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-emerald-600">
                  {productPreview.product.price?.toLocaleString()} DA
                </span>
                <Link
                  href={`https://bricomaitre.com/products/${productPreview.product._id}`}
                  className="text-xs text-emerald-600 hover:text-emerald-800"
                >
                  Voir le produit →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        <div className="bg-white rounded-lg shadow-sm p-4 mt-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              disabled={!pagination.hasPrevPage}
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-200 transition-colors disabled:cursor-not-allowed"
            >
              Précédent
            </button>

            <div className="w-32">
              <ReactSelect
                options={paginationOptions}
                value={{
                  value: pagination.currentPage,
                  label: `Page ${pagination.currentPage}`,
                }}
                onChange={(selected) => handlePageChange(selected.value)}
                className="text-sm"
                styles={{
                  control: (provided) => ({
                    ...provided,
                    minHeight: "40px",
                    fontSize: "0.875rem",
                    borderColor: "#d1d5db",
                  }),
                  menu: (provided) => ({
                    ...provided,
                    fontSize: "0.875rem",
                  }),
                }}
              />
            </div>

            <span className="text-gray-700 font-medium px-4 py-2 bg-gray-100 rounded-lg">
              {pagination.currentPage} sur {pagination.totalPages}
            </span>

            <button
              disabled={!pagination.hasNextPage}
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-200 transition-colors disabled:cursor-not-allowed"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>
      <ProductEditorPopup
  isOpen={!!editingOrder}
  onClose={() => setEditingOrder(null)}
  order={editingOrder}
  allProducts={products}
  onSave={async (orderId, newProducts) => {
    await axios.put(`/api/orders?id=${orderId}`, {
      cartProducts: newProducts
    });
    await fetchOrders(pagination.currentPage);
  }}
/>

      {/* Shopping List Modal */}
      {showShoppingList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-6 rounded-t-lg">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <FaList size={24} />
                    Liste d'achat des commandes
                  </h2>
                  <p className="text-emerald-100 text-sm mt-1">
                    {shoppingListOrders.totalOrders} commande(s) • {shoppingListOrders.totalUniqueProducts} produit(s) unique(s) • {shoppingListOrders.totalItems} article(s) total(aux)
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Create a new window with the shopping list content
                      const printWindow = window.open('', '_blank');

                      // Build the HTML content with string concatenation to avoid template literal issues
let htmlContent = '<!DOCTYPE html>';
htmlContent += '<html lang="fr">';
htmlContent += '<head>';
htmlContent += '<meta charset="UTF-8">';
htmlContent += '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
htmlContent += '<title>Liste d\'achat des commandes</title>';
htmlContent += '<script src="https://cdn.tailwindcss.com"></script>';
htmlContent += '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">';
htmlContent += '<style>';
htmlContent += 'body { font-family: sans-serif; }';
htmlContent += '@media print { body { -webkit-print-color-adjust: exact; color-adjust: exact; } .no-print { display: none !important; } }';
htmlContent += '@media (max-width: 640px) { .product-card { flex-direction: column; align-items: flex-start; } .product-card img { width: 60px; height: 60px; margin-bottom: 8px; } .order-break { display: block; } .grid { grid-template-columns: 1fr !important; } }';
htmlContent += '</style>';
htmlContent += '</head>';
htmlContent += '<body class="bg-gray-100 p-4">';
htmlContent += '<div class="max-w-6xl mx-auto">';

// Header
htmlContent += '<div class="bg-white rounded-lg shadow-lg p-6 mb-6">';
htmlContent += '<h1 class="text-3xl font-bold text-gray-800 flex items-center gap-2">';
htmlContent += '<i class="fas fa-list text-emerald-600"></i> Liste d\'achat des commandes</h1>';
htmlContent += '<p class="text-gray-600 mt-2">';
htmlContent += `${shoppingListOrders.totalOrders || 0} commande(s) • ${shoppingListOrders.totalUniqueProducts || 0} produit(s) unique(s) • ${shoppingListOrders.totalItems || 0} article(s) total(aux)`;
htmlContent += '</p></div>';

// Grid
htmlContent += '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">';

// Consolidated List
htmlContent += '<div class="bg-gray-50 rounded-lg p-4">';
htmlContent += '<h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">';
htmlContent += '<i class="fas fa-box text-emerald-600"></i> Vue consolidée (Tous les produits)</h3>';
htmlContent += '<div class="space-y-3 max-h-96 overflow-y-auto">';

if (shoppingListOrders.consolidatedProducts && shoppingListOrders.consolidatedProducts.length > 0) {
  const brandsMap = shoppingListOrders.consolidatedProducts.reduce((acc, product) => {
    const brand = product.brand || "Sans marque";
    if (!acc[brand]) acc[brand] = [];
    acc[brand].push(product);
    return acc;
  }, {});

  Object.entries(brandsMap).forEach(([brand, products]) => {
    htmlContent += `<div class="mb-4"><h4 class="font-semibold text-emerald-700 mb-2">${brand}</h4>`;

    products.forEach((product, index) => {
      const textColor = hasSecondary(product.id)
        ? "text-emerald-600 hover:text-emerald-800"
        : "text-gray-500 hover:text-gray-700";

      htmlContent += `<div class="flex items-center gap-3 p-3 rounded-lg ${index % 2 === 0 ? "bg-white" : "bg-gray-100"}">`;

      if (product.image) {
        htmlContent += `<img src="${product.image}" alt="${product.title}" class="w-12 h-12 object-contain rounded border">`;
      } else {
        htmlContent += '<div class="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">';
        htmlContent += '<span class="text-gray-500 text-xs">N/A</span></div>';
      }

      htmlContent += `<div class="flex-1 min-w-0">`;
      htmlContent += `<p class="font-medium truncate ${textColor}">${product.title}</p>`;
      htmlContent += `<p class="text-sm text-emerald-600 font-semibold">Qté: ${product.totalQuantity}</p>`;

      if (product.notes && product.notes.length > 0) {
        htmlContent += `<div class="mt-1 p-1 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs rounded">📝 ${product.notes.join(" | ")}</div>`;
      }

      htmlContent += `</div>`; // flex-1
      htmlContent += `<span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full text-xs font-semibold">x${product.totalQuantity}</span>`;
      htmlContent += `</div>`; // product
    });

    htmlContent += `</div>`; // brand
  });
} else {
  htmlContent += '<div class="text-center py-8 text-gray-500">';
  htmlContent += '<i class="fas fa-box text-gray-400 mb-2"></i><p>Aucun produit trouvé</p>';
  htmlContent += '<p class="text-sm mt-1">Les commandes sélectionnées ne contiennent pas de produits</p></div>';
}

htmlContent += '</div></div>'; // consolidated list

// Individual Orders
htmlContent += '<div class="bg-gray-50 rounded-lg p-4">';
htmlContent += '<h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">';
htmlContent += '<i class="fas fa-user text-emerald-600"></i> Vue par commande</h3>';
htmlContent += '<div class="space-y-4 max-h-96 overflow-y-auto">';

if (shoppingListOrders.individualOrders && shoppingListOrders.individualOrders.length > 0) {
  shoppingListOrders.individualOrders.forEach((order, index) => {
    const grouped = order.products.reduce((acc, product) => {
      const brand = product.brand || "Sans marque";
      if (!acc[brand]) acc[brand] = [];
      acc[brand].push(product);
      return acc;
    }, {});

    htmlContent += `<div class="p-3 rounded-lg ${index % 2 === 0 ? "bg-white" : "bg-gray-100"}">`;
    htmlContent += `<div class="flex justify-between items-center mb-2">`;
    htmlContent += `<span class="font-bold text-gray-900">Commande: ${order.orderId?.toString().substring(0, 8)}...</span>`;
    htmlContent += `<span class="text-sm text-gray-600">${order.customer}</span>`;
    htmlContent += `</div>`;

    if (order.note) {
      htmlContent += `<div class="mb-2 p-2 bg-yellow-50 rounded text-sm text-gray-700 border border-yellow-200">`;
      htmlContent += `<span class="font-medium">Note:</span> ${order.note}</div>`;
    }

    Object.entries(grouped).forEach(([brand, products]) => {
      htmlContent += `<h4 class="font-semibold text-emerald-700 ml-1 mb-1">${brand}</h4>`;

      products.forEach((product) => {
        const textColor = hasSecondary(product.id)
          ? "text-emerald-600 hover:text-emerald-800"
          : "text-gray-500 hover:text-gray-700";

        htmlContent += `<div class="flex items-center gap-2 ml-3">`;

        if (productsMap[product.id]?.images?.[0]) {
          htmlContent += `<img src="${productsMap[product.id].images[0]}" alt="${product.title}" class="w-8 h-8 object-contain rounded border">`;
        } else {
          htmlContent += '<div class="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">';
          htmlContent += '<span class="text-gray-500 text-xs">N/A</span></div>';
        }

        htmlContent += `<span class="text-sm flex-1 truncate ${textColor}">${product.title}</span>`;
        htmlContent += `<span class="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs font-semibold">x${product.quantity}</span>`;

        if (product.note) {
          htmlContent += `<span class="ml-2 text-xs text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">📝 ${product.note}</span>`;
        }

        htmlContent += `</div>`; // product
      });
    });

    htmlContent += `</div>`; // order
  });
} else {
  htmlContent += '<div class="text-center py-8 text-gray-500">';
  htmlContent += '<i class="fas fa-user text-gray-400 mb-2"></i><p>Aucune commande trouvée</p>';
  htmlContent += '<p class="text-sm mt-1">Aucune commande n\'a été sélectionnée</p></div>';
}

htmlContent += '</div></div>'; // individual orders

htmlContent += '</div>'; // grid

htmlContent += `<div class="mt-6 text-center text-gray-500 text-sm no-print">Généré le: ${new Date().toLocaleString('fr-FR')}</div>`;

htmlContent += '</div></body></html>';


                      printWindow.document.write(htmlContent);
                      printWindow.document.close();
                    }}
                    className="text-white hover:bg-emerald-800 rounded-full p-2 transition-colors mr-2"
                    title="Agrandir dans un nouvel onglet"
                  >
                    <FaExpand size={20} />
                  </button>
                  <button
                    onClick={closeShoppingList}
                    className="text-white hover:bg-emerald-800 rounded-full p-2 transition-colors"
                  >
                    <FaTimes size={20} />
                  </button>
                </div>
              </div>
            </div>

<div className="flex-1 overflow-y-auto p-6">
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Consolidated List */}
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <FaBox className="text-emerald-600" />
        Vue consolidée (Tous les produits)
      </h3>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {shoppingListOrders.consolidatedProducts &&
        shoppingListOrders.consolidatedProducts.length > 0 ? (
          Object.entries(
            shoppingListOrders.consolidatedProducts.reduce((acc, product) => {
              const brand = product.brand || "Sans marque";
              if (!acc[brand]) acc[brand] = [];
              acc[brand].push(product);
              return acc;
            }, {})
          ).map(([brand, products]) => (
            <div key={brand} className="mb-4">
              <h4 className="font-semibold text-emerald-700 mb-2">{brand}</h4>

              {products.map((product, index) => (
                <div
                  key={product.id}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    index % 2 === 0 ? "bg-white" : "bg-gray-100"
                  }`}
                >
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.title}
                      className={`w-12 h-12 object-contain rounded border`}
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                      <span className="text-gray-500 text-xs">N/A</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${
    hasSecondary(product.id)
      ? "text-emerald-600 hover:text-emerald-800"
      : "text-gray-500 hover:text-gray-700"
  }`}>
                      {product.title}
                    </p>

                    <p className="text-sm text-emerald-600 font-semibold">
                      Qté: {product.totalQuantity}
                    </p>

                    {/* Notes from all orders that include this product */}
                    {product.notes && product.notes.length > 0 && (
                      <div className="mt-1 p-1 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs rounded">
                        📝 {product.notes.join(" | ")}
                      </div>
                    )}
                  </div>

                  <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full text-xs font-semibold">
                    x{product.totalQuantity}
                  </span>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FaBox className="mx-auto text-gray-400 mb-2" size={32} />
            <p>Aucun produit trouvé</p>
            <p className="text-sm mt-1">
              Les commandes sélectionnées ne contiennent pas de produits
            </p>
          </div>
        )}
      </div>
    </div>

    {/* Individual Orders List */}
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <FaUser className="text-emerald-600" />
        Vue par commande
      </h3>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {shoppingListOrders.individualOrders &&
        shoppingListOrders.individualOrders.length > 0 ? (
          shoppingListOrders.individualOrders.map((order, index) => {
            const grouped = order.products.reduce((acc, product) => {
              const brand = product.brand || "Sans marque";
              if (!acc[brand]) acc[brand] = [];
              acc[brand].push(product);
              return acc;
            }, {});

            return (
              <div
                key={order.orderId}
                className={`p-3 rounded-lg ${
                  index % 2 === 0 ? "bg-white" : "bg-gray-100"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-gray-900">
                    Commande: {order.orderId?.toString().substring(0, 8)}...
                  </span>
                  <span className="text-sm text-gray-600">{order.customer}</span>
                </div>

                {order.note && (
                  <div className="mb-2 p-2 bg-yellow-50 rounded text-sm text-gray-700 border border-yellow-200">
                    <span className="font-medium">Note:</span> {order.note}
                  </div>
                )}

                <div className="space-y-3">
                  {Object.entries(grouped).map(([brand, products]) => (
                    <div key={brand}>
                      <h4 className="font-semibold text-emerald-700 ml-1 mb-1">
                        {brand}
                      </h4>

                      {products.map((product, prodIndex) => (
                        <div
                          key={prodIndex}
                          className="flex items-center gap-2 ml-3"
                        >
                          <div className="w-8 h-8 flex-shrink-0">
                            {productsMap[product.id]?.images?.[0] ? (
                              <img
                                src={productsMap[product.id].images[0]}
                                alt={product.title}
                                className="w-full h-full object-contain rounded border"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center">
                                <span className="text-gray-500 text-xs">
                                  N/A
                                </span>
                              </div>
                            )}
                          </div>

                          <span className={`text-sm flex-1 truncate ${
    hasSecondary(product.id)
      ? "text-emerald-600 hover:text-emerald-800"
      : "text-gray-500 hover:text-gray-700"
  }`}>
                            {product.title}
                          </span>

                          <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs font-semibold">
                            x{product.quantity}
                          </span>

                          {product.note && (
                            <span className="ml-2 text-xs text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">
                              📝 {product.note}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FaUser className="mx-auto text-gray-400 mb-2" size={32} />
            <p>Aucune commande trouvée</p>
            <p className="text-sm mt-1">
              Aucune commande n'a été sélectionnée
            </p>
          </div>
        )}
      </div>
    </div>
  </div>
</div>

            <div className="border-t p-4 bg-gray-50 rounded-b-lg flex justify-end">
              <button
                onClick={closeShoppingList}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
